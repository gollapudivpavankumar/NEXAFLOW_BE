import express from 'express';
import Attendance from '../models/Attendance.js';
import { protect, orgAdminOrSuperAdmin, employeeOrOrgAdmin, checkOrganizationAccess, checkEmployeeSelfAccess } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/attendance/:organizationId/swipe-in
// @desc    Employee swipes in
// @access  Employee
router.post('/:organizationId/swipe-in', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    // Check if already clocked in (not clocked out)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await Attendance.findOne({
      employeeId,
      organizationId,
      date: { $gte: today, $lt: tomorrow },
      status: { $in: ['clocked-in', 'on-break'] }
    });

    if (existing) {
      return res.status(400).json({
        message: existing.status === 'on-break'
          ? 'Please end your break before trying to clock in again'
          : 'You are already clocked in. Please clock out first.'
      });
    }

    // Create new attendance record
    const attendance = await Attendance.create({
      employeeId,
      organizationId,
      date: new Date(),
      swipeInTime: new Date(),
      status: 'clocked-in'
    });

    const populated = await Attendance.findById(attendance._id).populate('employeeId', 'name email');
    res.status(201).json({ attendance: populated });
  } catch (error) {
    console.error('Swipe in error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/attendance/:organizationId/swipe-out
// @desc    Employee swipes out
// @access  Employee
router.post('/:organizationId/swipe-out', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    // Find today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendance = await Attendance.findOne({
      employeeId,
      organizationId,
      date: { $gte: today },
      status: { $in: ['clocked-in', 'on-break'] }
    });

    if (!attendance) {
      return res.status(400).json({ message: 'No active clock-in found' });
    }

    attendance.swipeOutTime = new Date();
    attendance.status = 'clocked-out';
    await attendance.save();

    const populated = await Attendance.findById(attendance._id).populate('employeeId', 'name email');
    res.json({ attendance: populated });
  } catch (error) {
    console.error('Swipe out error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/attendance/:organizationId/break-start
// @desc    Employee starts break
// @access  Employee
router.post('/:organizationId/break-start', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendance = await Attendance.findOne({
      employeeId,
      organizationId,
      date: { $gte: today },
      status: 'clocked-in'
    });

    if (!attendance) {
      return res.status(400).json({ message: 'Must be clocked in to start break' });
    }

    attendance.breakStartTime = new Date();
    attendance.status = 'on-break';
    await attendance.save();

    const populated = await Attendance.findById(attendance._id).populate('employeeId', 'name email');
    res.json({ attendance: populated });
  } catch (error) {
    console.error('Break start error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/attendance/:organizationId/break-end
// @desc    Employee ends break
// @access  Employee
router.post('/:organizationId/break-end', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.body.employeeId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendance = await Attendance.findOne({
      employeeId,
      organizationId,
      date: { $gte: today },
      status: 'on-break'
    });

    if (!attendance) {
      return res.status(400).json({ message: 'No active break found' });
    }

    attendance.breakEndTime = new Date();
    attendance.status = 'clocked-in';
    await attendance.save();

    const populated = await Attendance.findById(attendance._id).populate('employeeId', 'name email');
    res.json({ attendance: populated });
  } catch (error) {
    console.error('Break end error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/attendance/:organizationId/employee/:employeeId
// @desc    Get attendance records for an employee
// @access  Employee (own), OrgAdmin, SuperAdmin
router.get('/:organizationId/employee/:employeeId', protect, checkOrganizationAccess, checkEmployeeSelfAccess, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;
    const { startDate, endDate } = req.query;

    let query = { employeeId, organizationId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const records = await Attendance.find(query)
      .populate('employeeId', 'name email')
      .sort({ date: -1 });

    res.json({ records });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/:organizationId/today
// @desc    Get today's attendance for current employee
// @access  Employee
router.get('/:organizationId/today', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get the most recent attendance record for today
    const attendance = await Attendance.findOne({
      employeeId,
      organizationId,
      date: { $gte: today, $lt: tomorrow }
    })
    .sort({ createdAt: -1 })
    .populate('employeeId', 'name email');

    res.json({ attendance });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/attendance/:organizationId/report
// @desc    Get all attendance records for organization
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/report', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { startDate, endDate, employeeId } = req.query;

    let query = { organizationId };

    if (employeeId) {
      query.employeeId = employeeId;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const records = await Attendance.find(query)
      .populate('employeeId', 'name email')
      .sort({ date: -1, swipeInTime: -1 });

    res.json({ records });
  } catch (error) {
    console.error('Get attendance report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/attendance/:organizationId/:id
// @desc    Update attendance record (manual correction)
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { swipeInTime, swipeOutTime, breakStartTime, breakEndTime, notes } = req.body;

    const attendance = await Attendance.findOne({ _id: id, organizationId });

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (swipeInTime) attendance.swipeInTime = new Date(swipeInTime);
    if (swipeOutTime) attendance.swipeOutTime = new Date(swipeOutTime);
    if (breakStartTime) attendance.breakStartTime = new Date(breakStartTime);
    if (breakEndTime) attendance.breakEndTime = new Date(breakEndTime);
    if (notes !== undefined) attendance.notes = notes;

    attendance.modifiedBy = req.user._id;
    await attendance.save();

    const populated = await Attendance.findById(attendance._id).populate('employeeId', 'name email');
    res.json({ attendance: populated });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

export default router;
