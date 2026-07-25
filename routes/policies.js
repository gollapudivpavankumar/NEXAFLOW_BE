import express from 'express';
import Policy from '../models/Policy.js';
import Employee from '../models/Employee.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// Get active policies for employees - MUST come before /:organizationId/:id
router.get('/:organizationId/employee/active', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const policies = await Policy.find({
      organizationId: req.params.organizationId,
      isActive: true
    }).sort({ createdAt: -1 });

    // Add acknowledgment status for each policy
    const policiesWithStatus = policies.map(policy => {
      const acknowledged = policy.acknowledgments.some(
        ack => ack.employeeId.toString() === employee._id.toString()
      );
      return {
        ...policy.toObject(),
        acknowledgedByMe: acknowledged
      };
    });

    res.json({ policies: policiesWithStatus });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get unacknowledged policies for employee (for first login) - MUST come before /:organizationId/:id
router.get('/:organizationId/employee/unacknowledged', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const allPolicies = await Policy.find({
      organizationId: req.params.organizationId,
      isActive: true,
      requiresAgreement: true
    });

    const unacknowledgedPolicies = allPolicies.filter(policy => {
      return !policy.acknowledgments.some(
        ack => ack.employeeId.toString() === employee._id.toString()
      );
    });

    res.json({ policies: unacknowledgedPolicies });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all policies (admin)
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const policies = await Policy.find({ organizationId: req.params.organizationId })
      .sort({ createdAt: -1 });
    res.json({ policies });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single policy by ID
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const policy = await Policy.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('createdBy', 'email');

    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    // For employees, add their acknowledgment status
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (employee) {
        const policyObj = policy.toObject();
        policyObj.acknowledgedByMe = policy.acknowledgments.some(
          ack => ack.employeeId.toString() === employee._id.toString()
        );
        return res.json({ policy: policyObj });
      }
    }

    res.json({ policy });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create policy
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { title, description, content, fileUrl, fileType, category, isActive, requiresAgreement, effectiveDate, expiryDate, version } = req.body;

    const policy = await Policy.create({
      title,
      description,
      content,
      fileUrl,
      fileType,
      category,
      isActive,
      requiresAgreement,
      effectiveDate,
      expiryDate,
      version,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });
    res.status(201).json({ policy });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update policy
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { title, description, content, fileUrl, fileType, category, isActive, requiresAgreement, effectiveDate, expiryDate, version } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (content !== undefined) updateData.content = content;
    if (fileUrl !== undefined) updateData.fileUrl = fileUrl;
    if (fileType !== undefined) updateData.fileType = fileType;
    if (category !== undefined) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (requiresAgreement !== undefined) updateData.requiresAgreement = requiresAgreement;
    if (effectiveDate !== undefined) updateData.effectiveDate = effectiveDate;
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
    if (version !== undefined) updateData.version = version;

    const policy = await Policy.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true }
    );

    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    res.json({ policy });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Acknowledge policy (employee)
router.post('/:organizationId/:id/acknowledge', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const policy = await Policy.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    // Check if already acknowledged
    const alreadyAcknowledged = policy.acknowledgments.some(
      ack => ack.employeeId.toString() === employee._id.toString()
    );

    if (alreadyAcknowledged) {
      return res.status(400).json({ message: 'Policy already acknowledged' });
    }

    policy.acknowledgments.push({
      employeeId: employee._id,
      acknowledgedDate: new Date(),
      ipAddress: req.ip || req.socket?.remoteAddress || ''
    });

    await policy.save();
    res.json({ message: 'Policy acknowledged successfully', policy });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get policy acknowledgments (admin)
router.get('/:organizationId/:id/acknowledgments', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const policy = await Policy.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('acknowledgments.employeeId', 'name email');

    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    res.json({ acknowledgments: policy.acknowledgments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete policy
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const policy = await Policy.findOneAndDelete({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });
    res.json({ message: 'Policy deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
