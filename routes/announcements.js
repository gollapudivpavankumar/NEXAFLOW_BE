import express from 'express';
import Announcement from '../models/Announcement.js';
import Notification from '../models/Notification.js';
import Employee from '../models/Employee.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/announcements/:organizationId
// @desc    Admin gets all announcements
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const announcements = await Announcement.find({ organizationId: req.params.organizationId })
      .populate('createdBy', 'email')
      .populate('targetEmployees', 'name email')
      .sort({ isPinned: -1, publishedAt: -1 });

    res.json({ announcements });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/announcements/:organizationId/feed
// @desc    Employee/OrgAdmin gets announcements targeted to them
// @access  Employee, OrgAdmin
router.get('/:organizationId/feed', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id, organizationId: req.params.organizationId });

    // Build query conditions based on whether we have an employee record
    const targetConditions = [{ targetType: 'all' }];
    if (employee) {
      if (employee.department) {
        targetConditions.push({ targetType: 'departments', targetDepartments: employee.department });
      }
      targetConditions.push({ targetType: 'employees', targetEmployees: employee._id });
    }

    // OrgAdmin/SuperAdmin can see all announcements for their org
    if (req.user.role === 'orgadmin' || req.user.role === 'superadmin') {
      targetConditions.push({ targetType: 'departments' });
      targetConditions.push({ targetType: 'employees' });
    }

    const rawAnnouncements = await Announcement.find({
      organizationId: req.params.organizationId,
      isActive: true,
      $or: targetConditions
    })
      .populate('createdBy', 'email')
      .sort({ isPinned: -1, publishedAt: -1 });

    // Add isAcknowledged flag for the current user
    const userId = req.user._id.toString();
    const announcements = rawAnnouncements.map(a => {
      const obj = a.toObject();
      const ack = obj.acknowledgments?.find(
        ack => ack.userId && ack.userId.toString() === userId
      );
      obj.isAcknowledged = !!ack;
      obj.acknowledgedAt = ack ? ack.acknowledgedAt : null;
      return obj;
    });

    res.json({ announcements });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/announcements/:organizationId/:id
// @desc    Get single announcement
// @access  Protected
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('createdBy', 'email')
      .populate('targetEmployees', 'name email')
      .populate('acknowledgments.employeeId', 'name email')
      .populate('acknowledgments.userId', 'email');

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/announcements/:organizationId
// @desc    OrgAdmin creates announcement
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { title, content, priority, targetType, targetDepartments, targetEmployees, isPinned, attachments, expiresAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const announcement = await Announcement.create({
      organizationId: req.params.organizationId,
      title,
      content,
      priority,
      targetType,
      targetDepartments,
      targetEmployees,
      isPinned,
      attachments,
      expiresAt,
      createdBy: req.user._id
    });

    res.status(201).json({ announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/announcements/:organizationId/:id
// @desc    OrgAdmin updates announcement
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      req.body,
      { new: true }
    );

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/announcements/:organizationId/:id/pin
// @desc    OrgAdmin toggles isPinned
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/pin', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    announcement.isPinned = !announcement.isPinned;
    await announcement.save();

    res.json({ announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/announcements/:organizationId/:id/acknowledge
// @desc    Employee/OrgAdmin acknowledges announcement
// @access  Employee, OrgAdmin
router.post('/:organizationId/:id/acknowledge', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    // Check if already acknowledged
    const alreadyAcknowledged = announcement.acknowledgments.find(
      a => a.userId && a.userId.toString() === req.user._id.toString()
    );

    if (alreadyAcknowledged) {
      return res.status(400).json({ message: 'Already acknowledged' });
    }

    announcement.acknowledgments.push({
      employeeId: req.user.employeeId,
      userId: req.user._id,
      acknowledgedAt: new Date()
    });

    await announcement.save();

    res.json({ message: 'Announcement acknowledged', announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/announcements/:organizationId/:id/acknowledgments
// @desc    Admin gets acknowledgment details
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/:id/acknowledgments', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('acknowledgments.employeeId', 'name email department')
      .populate('acknowledgments.userId', 'email');

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ acknowledgments: announcement.acknowledgments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/announcements/:organizationId/:id
// @desc    Admin deletes (soft-delete) announcement
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      { isActive: false },
      { new: true }
    );

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
