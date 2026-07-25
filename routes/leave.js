import express from 'express';
import LeaveType from '../models/LeaveType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import LeaveBalance from '../models/LeaveBalance.js';
import { protect, orgAdminOrSuperAdmin, employeeOrOrgAdmin, checkOrganizationAccess, checkEmployeeSelfAccess } from '../middleware/auth.js';

const router = express.Router();

// ==================== LEAVE TYPES ====================

// @route   GET /api/leave/:organizationId/types
// @desc    Get all leave types for organization
// @access  OrgAdmin, SuperAdmin, Employee
router.get('/:organizationId/types', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const leaveTypes = await LeaveType.find({ organizationId, isActive: true });
    res.json({ leaveTypes });
  } catch (error) {
    console.error('Get leave types error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leave/:organizationId/types
// @desc    Create leave type
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/types', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, daysPerYear, description } = req.body;

    const leaveType = await LeaveType.create({
      organizationId,
      name,
      daysPerYear,
      description
    });

    res.status(201).json({ leaveType });
  } catch (error) {
    console.error('Create leave type error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/leave/:organizationId/types/:id
// @desc    Update leave type
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/types/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { name, daysPerYear, description, isActive } = req.body;

    const leaveType = await LeaveType.findOne({ _id: id, organizationId });
    if (!leaveType) {
      return res.status(404).json({ message: 'Leave type not found' });
    }

    if (name !== undefined) leaveType.name = name;
    if (daysPerYear !== undefined) leaveType.daysPerYear = daysPerYear;
    if (description !== undefined) leaveType.description = description;
    if (isActive !== undefined) leaveType.isActive = isActive;

    await leaveType.save();
    res.json({ leaveType });
  } catch (error) {
    console.error('Update leave type error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ==================== LEAVE REQUESTS ====================

// @route   POST /api/leave/:organizationId/requests
// @desc    Employee submits leave request
// @access  Employee
router.post('/:organizationId/requests', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;
    const { leaveTypeId, startDate, endDate, days, reason } = req.body;

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    // Check leave balance
    const currentYear = new Date().getFullYear();
    const balance = await LeaveBalance.findOne({
      employeeId,
      organizationId,
      leaveTypeId,
      year: currentYear
    });

    if (balance && balance.availableDays < days) {
      return res.status(400).json({ message: 'Insufficient leave balance' });
    }

    const leaveRequest = await LeaveRequest.create({
      employeeId,
      organizationId,
      leaveTypeId,
      startDate,
      endDate,
      days,
      reason
    });

    const populated = await LeaveRequest.findById(leaveRequest._id)
      .populate('employeeId', 'name email')
      .populate('leaveTypeId', 'name');

    res.status(201).json({ leaveRequest: populated });
  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/leave/:organizationId/requests/my
// @desc    Get employee's own leave requests
// @access  Employee
router.get('/:organizationId/requests/my', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const requests = await LeaveRequest.find({ employeeId, organizationId })
      .populate('leaveTypeId', 'name')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leave/:organizationId/requests
// @desc    Get all leave requests (for org admin)
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/requests', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { status } = req.query;

    let query = { organizationId };
    if (status) {
      query.status = status;
    }

    const requests = await LeaveRequest.find(query)
      .populate('employeeId', 'name email')
      .populate('leaveTypeId', 'name')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/leave/:organizationId/requests/:id/approve
// @desc    Approve leave request
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/requests/:id/approve', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { comments } = req.body;

    const leaveRequest = await LeaveRequest.findOne({ _id: id, organizationId });
    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Leave request already processed' });
    }

    leaveRequest.status = 'approved';
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewDate = new Date();
    leaveRequest.reviewComments = comments;
    await leaveRequest.save();

    // Update leave balance
    const currentYear = new Date().getFullYear();
    const balance = await LeaveBalance.findOne({
      employeeId: leaveRequest.employeeId,
      organizationId,
      leaveTypeId: leaveRequest.leaveTypeId,
      year: currentYear
    });

    if (balance) {
      balance.usedDays += leaveRequest.days;
      await balance.save();
    }

    const populated = await LeaveRequest.findById(leaveRequest._id)
      .populate('employeeId', 'name email')
      .populate('leaveTypeId', 'name')
      .populate('reviewedBy', 'email');

    res.json({ leaveRequest: populated });
  } catch (error) {
    console.error('Approve leave error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/leave/:organizationId/requests/:id/reject
// @desc    Reject leave request
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/requests/:id/reject', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { comments } = req.body;

    const leaveRequest = await LeaveRequest.findOne({ _id: id, organizationId });
    if (!leaveRequest) {
      return res.status(404).json({ message: 'Leave request not found' });
    }

    if (leaveRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Leave request already processed' });
    }

    leaveRequest.status = 'rejected';
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewDate = new Date();
    leaveRequest.reviewComments = comments;
    await leaveRequest.save();

    const populated = await LeaveRequest.findById(leaveRequest._id)
      .populate('employeeId', 'name email')
      .populate('leaveTypeId', 'name')
      .populate('reviewedBy', 'email');

    res.json({ leaveRequest: populated });
  } catch (error) {
    console.error('Reject leave error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ==================== LEAVE BALANCE ====================

// @route   GET /api/leave/:organizationId/balance/my
// @desc    Get employee's leave balance
// @access  Employee
router.get('/:organizationId/balance/my', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const currentYear = new Date().getFullYear();
    const balances = await LeaveBalance.find({
      employeeId,
      organizationId,
      year: currentYear
    }).populate('leaveTypeId', 'name');

    res.json({ balances });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leave/:organizationId/balance/employee/:employeeId
// @desc    Get leave balance for specific employee
// @access  OrgAdmin, SuperAdmin, Employee (own)
router.get('/:organizationId/balance/employee/:employeeId', protect, checkOrganizationAccess, checkEmployeeSelfAccess, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;
    const { year } = req.query;

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const balances = await LeaveBalance.find({
      employeeId,
      organizationId,
      year: currentYear
    }).populate('leaveTypeId', 'name');

    res.json({ balances });
  } catch (error) {
    console.error('Get employee balance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leave/:organizationId/balance
// @desc    Initialize leave balance for employee
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/balance', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { employeeId, leaveTypeId, year, totalDays } = req.body;

    const balance = await LeaveBalance.create({
      employeeId,
      organizationId,
      leaveTypeId,
      year: year || new Date().getFullYear(),
      totalDays,
      usedDays: 0
    });

    const populated = await LeaveBalance.findById(balance._id).populate('leaveTypeId', 'name');
    res.status(201).json({ balance: populated });
  } catch (error) {
    console.error('Create balance error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

export default router;
