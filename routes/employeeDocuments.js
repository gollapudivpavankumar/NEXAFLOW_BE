import express from 'express';
import EmployeeDocument from '../models/EmployeeDocument.js';
import Employee from '../models/Employee.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/employee-documents/:organizationId/employee/:employeeId
// @desc    Get all documents for an employee
// @access  Private (OrgAdmin, SuperAdmin)
router.get('/:organizationId/employee/:employeeId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    // Verify employee belongs to organization
    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const documents = await EmployeeDocument.find({ employeeId, organizationId, isActive: true })
      .populate('uploadedBy', 'email role')
      .sort({ createdAt: -1 });

    res.json({ documents });
  } catch (error) {
    console.error('Get employee documents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/employee-documents/:organizationId/employee/:employeeId
// @desc    Upload a new document for an employee
// @access  Private (OrgAdmin, SuperAdmin)
router.post('/:organizationId/employee/:employeeId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;
    const { documentName, documentType, fileData, fileName, fileType, fileSize, notes, expiryDate } = req.body;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    // Verify employee belongs to organization
    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Validate required fields
    if (!documentName || !fileData || !fileName || !fileType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check file size (limit to 10MB)
    if (fileSize > 10 * 1024 * 1024) {
      return res.status(400).json({ message: 'File size must be less than 10MB' });
    }

    const document = await EmployeeDocument.create({
      employeeId,
      organizationId,
      documentName,
      documentType: documentType || 'Other',
      fileData,
      fileName,
      fileType,
      fileSize,
      uploadedBy: req.user._id,
      notes,
      expiryDate: expiryDate ? new Date(expiryDate) : null
    });

    await document.populate('uploadedBy', 'email role');

    res.status(201).json({
      message: 'Document uploaded successfully',
      document
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/employee-documents/:organizationId/:documentId
// @desc    Get a specific document
// @access  Private (OrgAdmin, SuperAdmin)
router.get('/:organizationId/:documentId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, documentId } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const document = await EmployeeDocument.findOne({ _id: documentId, organizationId })
      .populate('uploadedBy', 'email role');

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ document });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/employee-documents/:organizationId/:documentId
// @desc    Update a document's metadata (not the file itself)
// @access  Private (OrgAdmin, SuperAdmin)
router.put('/:organizationId/:documentId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, documentId } = req.params;
    const { documentName, documentType, notes, expiryDate } = req.body;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const document = await EmployeeDocument.findOne({ _id: documentId, organizationId });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Update fields
    if (documentName) document.documentName = documentName;
    if (documentType) document.documentType = documentType;
    if (notes !== undefined) document.notes = notes;
    if (expiryDate !== undefined) document.expiryDate = expiryDate ? new Date(expiryDate) : null;

    await document.save();
    await document.populate('uploadedBy', 'email role');

    res.json({
      message: 'Document updated successfully',
      document
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/employee-documents/:organizationId/:documentId
// @desc    Delete a document (soft delete)
// @access  Private (OrgAdmin, SuperAdmin)
router.delete('/:organizationId/:documentId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, documentId } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const document = await EmployeeDocument.findOne({ _id: documentId, organizationId });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Soft delete
    document.isActive = false;
    await document.save();

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
