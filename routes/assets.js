import express from 'express';
import Asset from '../models/Asset.js';
import AssetRequest from '../models/AssetRequest.js';
import Employee from '../models/Employee.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import QRCode from 'qrcode';

const router = express.Router();

// Helper function to generate asset ID
const generateAssetId = async (organizationId) => {
  const orgSuffix = organizationId.toString().slice(-4);
  const prefix = `AST-${orgSuffix}-`;

  // Find the asset with the highest assetId number, not the most recently created
  const assets = await Asset.find({ organizationId })
    .select('assetId')
    .lean();

  if (!assets || assets.length === 0) {
    return `${prefix}0001`;
  }

  let maxNumber = 0;
  for (const asset of assets) {
    if (asset.assetId) {
      const parts = asset.assetId.split('-');
      const num = parseInt(parts[2]) || 0;
      if (num > maxNumber) maxNumber = num;
    }
  }

  const newNumber = (maxNumber + 1).toString().padStart(4, '0');
  return `${prefix}${newNumber}`;
};

// Helper function to generate QR code
const generateQRCode = async (assetData) => {
  try {
    const qrData = JSON.stringify({
      assetId: assetData.assetId,
      name: assetData.name,
      category: assetData.category,
      serialNumber: assetData.serialNumber
    });
    return await QRCode.toDataURL(qrData);
  } catch (error) {
    console.error('QR Code generation error:', error);
    return null;
  }
};

// Get my assets (employee) - MUST come before /:organizationId
router.get('/:organizationId/my-assets', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const assets = await Asset.find({ assignedTo: employee._id, organizationId: req.params.organizationId });
    res.json({ assets });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get asset statistics for reports - MUST come before /:organizationId/:id
router.get('/:organizationId/reports/statistics', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const assets = await Asset.find({ organizationId: req.params.organizationId });

    const stats = {
      total: assets.length,
      byStatus: {},
      byCategory: {},
      totalValue: 0,
      assigned: 0,
      available: 0,
      underRepair: 0,
      retired: 0,
      lost: 0
    };

    assets.forEach(asset => {
      stats.byStatus[asset.status] = (stats.byStatus[asset.status] || 0) + 1;
      stats.byCategory[asset.category] = (stats.byCategory[asset.category] || 0) + 1;
      if (asset.purchasePrice) {
        stats.totalValue += asset.purchasePrice;
      }
      if (asset.status === 'Assigned') stats.assigned++;
      if (asset.status === 'Available') stats.available++;
      if (asset.status === 'Under Repair') stats.underRepair++;
      if (asset.status === 'Retired') stats.retired++;
      if (asset.status === 'Lost') stats.lost++;
    });

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Bulk import assets - MUST come before /:organizationId/:id
router.post('/:organizationId/bulk-import', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { assets } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ message: 'Invalid assets data' });
    }

    const createdAssets = [];
    const errors = [];

    for (let i = 0; i < assets.length; i++) {
      try {
        const assetData = assets[i];
        const assetId = assetData.assetId || await generateAssetId(req.params.organizationId);

        const newAssetData = {
          name: assetData.name,
          category: assetData.category,
          manufacturer: assetData.manufacturer,
          model: assetData.model,
          serialNumber: assetData.serialNumber,
          purchaseDate: assetData.purchaseDate,
          purchasePrice: assetData.purchasePrice,
          warrantyExpiry: assetData.warrantyExpiry,
          condition: assetData.condition,
          status: assetData.status,
          specifications: assetData.specifications,
          location: assetData.location,
          notes: assetData.notes,
          assetId,
          organizationId: req.params.organizationId,
          createdBy: req.user._id
        };

        const qrCode = await generateQRCode(newAssetData);
        if (qrCode) {
          newAssetData.qrCode = qrCode;
        }

        const asset = await Asset.create(newAssetData);
        createdAssets.push(asset);
      } catch (error) {
        errors.push({ row: i + 1, error: error.message });
      }
    }

    res.status(201).json({
      message: `Successfully imported ${createdAssets.length} assets`,
      created: createdAssets.length,
      failed: errors.length,
      errors
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all requests - MUST come before /:organizationId/:id
router.get('/:organizationId/requests', protect, checkOrganizationAccess, async (req, res) => {
  try {
    let query = { organizationId: req.params.organizationId };

    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      query.employeeId = employee._id;
    }

    const requests = await AssetRequest.find(query)
      .populate('assetId')
      .populate('employeeId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create asset request (employee) - MUST come before /:organizationId/:id
router.post('/:organizationId/requests', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const { assetId, requestType, description, priority } = req.body;

    const request = await AssetRequest.create({
      assetId,
      requestType,
      description,
      priority,
      organizationId: req.params.organizationId,
      employeeId: employee._id
    });
    res.status(201).json({ request });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update request status - MUST come before /:organizationId/:id
router.put('/:organizationId/requests/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const request = await AssetRequest.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      { status, adminNotes, resolvedBy: req.user._id, resolvedDate: new Date() },
      { new: true }
    );

    if (!request) return res.status(404).json({ message: 'Request not found' });

    res.json({ request });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all assets (admin)
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const assets = await Asset.find({ organizationId: req.params.organizationId })
      .populate('assignedTo', 'name email')
      .populate('assignmentHistory.employeeId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ assets });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single asset by ID
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('assignedTo', 'name email')
      .populate('assignmentHistory.employeeId', 'name email');

    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    res.json({ asset });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create asset
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const assetId = req.body.assetId || await generateAssetId(req.params.organizationId);

    const { name, category, manufacturer, model, serialNumber, purchaseDate, purchasePrice, warrantyExpiry, condition, status, assignedTo, specifications, location, notes } = req.body;

    const assetData = {
      name,
      category,
      manufacturer,
      model,
      serialNumber,
      purchaseDate,
      purchasePrice,
      warrantyExpiry,
      condition,
      status,
      assignedTo,
      specifications,
      location,
      notes,
      assetId,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    };

    // Generate QR code
    const qrCode = await generateQRCode(assetData);
    if (qrCode) {
      assetData.qrCode = qrCode;
    }

    const asset = await Asset.create(assetData);
    res.status(201).json({ asset });
  } catch (error) {
    console.error('Error creating asset:', error);
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
  }
});

// Update asset
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, category, manufacturer, model, serialNumber, purchaseDate, purchasePrice, warrantyExpiry, condition, status, assignedTo, specifications, location, notes } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
    if (model !== undefined) updateData.model = model;
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (purchaseDate !== undefined) updateData.purchaseDate = purchaseDate;
    if (purchasePrice !== undefined) updateData.purchasePrice = purchasePrice;
    if (warrantyExpiry !== undefined) updateData.warrantyExpiry = warrantyExpiry;
    if (condition !== undefined) updateData.condition = condition;
    if (status !== undefined) updateData.status = status;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (specifications !== undefined) updateData.specifications = specifications;
    if (location !== undefined) updateData.location = location;
    if (notes !== undefined) updateData.notes = notes;

    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true }
    ).populate('assignedTo', 'name email')
     .populate('assignmentHistory.employeeId', 'name email');

    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    res.json({ asset });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign asset
router.post('/:organizationId/:id/assign', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { employeeId, notes } = req.body;
    const asset = await Asset.findOne({ _id: req.params.id, organizationId: req.params.organizationId });

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    // If already assigned to someone else, push old assignment to history
    if (asset.assignedTo && asset.assignedTo.toString() !== employeeId) {
      asset.assignmentHistory.push({
        employeeId: asset.assignedTo,
        assignedDate: asset.assignedDate,
        returnedDate: new Date(),
        condition: asset.condition,
        notes: 'Reassigned to another employee'
      });
    }

    asset.assignedTo = employeeId;
    asset.assignedDate = new Date();
    asset.status = 'Assigned';
    if (notes) asset.notes = notes;
    await asset.save();

    await asset.populate('assignedTo', 'name email');
    await asset.populate('assignmentHistory.employeeId', 'name email');

    res.json({ asset });
  } catch (error) {
    console.error('Error assigning asset:', error);
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
  }
});

// Unassign asset
router.post('/:organizationId/:id/unassign', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, organizationId: req.params.organizationId });

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    if (asset.assignedTo) {
      asset.assignmentHistory.push({
        employeeId: asset.assignedTo,
        assignedDate: asset.assignedDate,
        returnedDate: new Date(),
        condition: req.body.condition,
        notes: req.body.notes
      });
    }

    asset.assignedTo = null;
    asset.assignedDate = null;
    asset.status = 'Available';
    await asset.save();

    await asset.populate('assignmentHistory.employeeId', 'name email');

    res.json({ asset });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete asset
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const asset = await Asset.findOneAndDelete({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Asset deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Regenerate QR code for an asset
router.post('/:organizationId/:id/regenerate-qr', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    const qrCode = await generateQRCode(asset);
    asset.qrCode = qrCode;
    await asset.save();

    res.json({ asset, qrCode });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Download QR code
router.get('/:organizationId/:id/qr-code', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    if (!asset.qrCode) {
      const qrCode = await generateQRCode(asset);
      asset.qrCode = qrCode;
      await asset.save();
    }

    res.json({ qrCode: asset.qrCode });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
