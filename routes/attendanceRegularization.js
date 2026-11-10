import express from 'express';
import AttendanceRegularization from '../models/AttendanceRegularization.js';
import Employee from '../models/Employee.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all regularization requests
router.get('/:organizationId', protect, checkOrganizationAccess, async (req, res) => {
  try {
    let query = { organizationId: req.params.organizationId };

    // Employees see only their requests
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      query.employeeId = employee._id;
    }

    // Reporting managers see requests for their team
    if (req.user.role === 'reporting_manager') {
      query.reportingManagerId = req.user._id;
    }

    const requests = await AttendanceRegularization.find(query)
      .populate('employeeId', 'name email position')
      .populate('reportingManagerId', 'email')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get pending requests for reporting manager
router.get('/:organizationId/pending', protect, checkOrganizationAccess, async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Access denied' });
    }

    let query = {
      organizationId: req.params.organizationId,
      status: 'Pending'
    };

    if (req.user.role === 'reporting_manager') {
      query.reportingManagerId = req.user._id;
    }

    const requests = await AttendanceRegularization.find(query)
      .populate('employeeId', 'name email position')
      .populate('reportingManagerId', 'email')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get statistics (admin) - must be before /:organizationId/:id to avoid route shadowing
router.get('/:organizationId/stats/overview', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const requests = await AttendanceRegularization.find({
      organizationId: req.params.organizationId
    });

    const stats = {
      total: requests.length,
      pending: requests.filter(r => r.status === 'Pending').length,
      approved: requests.filter(r => r.status === 'Approved').length,
      rejected: requests.filter(r => r.status === 'Rejected').length,
      byType: {
        'Missing Punch': requests.filter(r => r.requestType === 'Missing Punch').length,
        'Wrong Punch': requests.filter(r => r.requestType === 'Wrong Punch').length,
        'Half Day': requests.filter(r => r.requestType === 'Half Day').length,
        'Work From Home': requests.filter(r => r.requestType === 'Work From Home').length,
        'On Duty': requests.filter(r => r.requestType === 'On Duty').length
      }
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single request
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const request = await AttendanceRegularization.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('employeeId', 'name email position')
      .populate('reportingManagerId', 'email')
      .populate('reviewedBy', 'email');

    if (!request) return res.status(404).json({ message: 'Request not found' });

    // Check access permissions
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee || request.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // reportingManagerId is populated as a User object; compare using _id
    if (req.user.role === 'reporting_manager') {
      const managerId = request.reportingManagerId?._id || request.reportingManagerId;
      if (!managerId || managerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json({ request });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create regularization request (employee)
router.post('/:organizationId', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Whitelist the fields an employee may supply — spreading req.body let a
    // caller create a request that was already 'Approved'.
    const {
      date, requestType, expectedCheckIn, expectedCheckOut,
      actualCheckIn, actualCheckOut, reason, attachments
    } = req.body;

    const request = await AttendanceRegularization.create({
      date, requestType, expectedCheckIn, expectedCheckOut,
      actualCheckIn, actualCheckOut, reason, attachments,
      organizationId: req.params.organizationId,
      employeeId: employee._id,
      reportingManagerId: employee.reportingManagerId
    });

    const populatedRequest = await AttendanceRegularization.findById(request._id)
      .populate('employeeId', 'name email position')
      .populate('reportingManagerId', 'email');

    res.status(201).json({ request: populatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Approve or reject request (reporting manager or admin)
router.put('/:organizationId/:id/review', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { status, reviewComments } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Check permissions
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const request = await AttendanceRegularization.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!request) return res.status(404).json({ message: 'Request not found' });

    // Only allow reviewing Pending requests
    if (request.status !== 'Pending') {
      return res.status(400).json({ message: 'This request has already been reviewed' });
    }

    // Reporting managers can only review requests assigned to them
    if (req.user.role === 'reporting_manager') {
      if (!request.reportingManagerId || request.reportingManagerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can only review requests assigned to you' });
      }
    }

    request.status = status;
    request.reviewedBy = req.user._id;
    request.reviewedDate = new Date();
    request.reviewComments = reviewComments;

    await request.save();

    const populatedRequest = await AttendanceRegularization.findById(request._id)
      .populate('employeeId', 'name email position')
      .populate('reportingManagerId', 'email')
      .populate('reviewedBy', 'email');

    res.json({ request: populatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update regularization request (employee - only if pending)
router.put('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const request = await AttendanceRegularization.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!request) return res.status(404).json({ message: 'Request not found' });

    // Check if employee owns this request
    if (request.employeeId.toString() !== employee._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Can only update if pending
    if (request.status !== 'Pending') {
      return res.status(400).json({ message: 'Cannot update a reviewed request' });
    }

    // Only allow updating safe fields (not status, reviewedBy, organizationId, employeeId)
    const { date, requestType, expectedCheckIn, expectedCheckOut, reason, attachments } = req.body;
    if (date !== undefined) request.date = date;
    if (requestType !== undefined) request.requestType = requestType;
    if (expectedCheckIn !== undefined) request.expectedCheckIn = expectedCheckIn;
    if (expectedCheckOut !== undefined) request.expectedCheckOut = expectedCheckOut;
    if (reason !== undefined) request.reason = reason;
    if (attachments !== undefined) request.attachments = attachments;
    await request.save();

    const populatedRequest = await AttendanceRegularization.findById(request._id)
      .populate('employeeId', 'name email position')
      .populate('reportingManagerId', 'email');

    res.json({ request: populatedRequest });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete regularization request
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const request = await AttendanceRegularization.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!request) return res.status(404).json({ message: 'Request not found' });

    // Employees can delete only their own pending requests
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee || request.employeeId.toString() !== employee._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (request.status !== 'Pending') {
        return res.status(400).json({ message: 'Cannot delete a reviewed request' });
      }
    }

    await AttendanceRegularization.findByIdAndDelete(req.params.id);
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
