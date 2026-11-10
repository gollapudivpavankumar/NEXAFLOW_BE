import express from 'express';
import PayslipRequest from '../models/PayslipRequest.js';
import Employee from '../models/Employee.js';
import { protect, orgAdminOrSuperAdmin, employeeOrOrgAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payslip-requests/:organizationId
// @desc    Employee requests payslip
// @access  Employee
router.post('/:organizationId', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { months, notes } = req.body;

    // Only employees can request
    if (req.user.role !== 'employee' || !req.user.employeeId) {
      return res.status(403).json({ message: 'Only employees can request payslips' });
    }

    // Check if employee exists and has salary configured
    const employee = await Employee.findById(req.user.employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee record not found. Please contact admin.' });
    }

    if (!employee.currentSalary || !employee.currentSalary.gross) {
      return res.status(400).json({ message: 'No salary configured. Please contact admin to set up your salary details.' });
    }

    if (!months || months.length === 0) {
      return res.status(400).json({ message: 'Please select at least one month' });
    }

    // Create request
    const request = await PayslipRequest.create({
      employeeId: req.user.employeeId,
      organizationId,
      months,
      notes: notes || '',
      status: 'pending'
    });

    const populatedRequest = await PayslipRequest.findById(request._id)
      .populate('employeeId', 'name email');

    res.status(201).json({ request: populatedRequest, message: 'Payslip request submitted successfully' });
  } catch (error) {
    console.error('Create payslip request error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/payslip-requests/:organizationId
// @desc    Get all payslip requests for organization (admin) or employee (employee)
// @access  OrgAdmin, SuperAdmin, Employee
router.get('/:organizationId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { status } = req.query;

    let query = { organizationId };

    // Employees can only see their own requests
    if (req.user.role === 'employee') {
      if (!req.user.employeeId) return res.json({ requests: [] });
      query.employeeId = req.user.employeeId;
    }

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    const requests = await PayslipRequest.find(query)
      .populate('employeeId', 'name email')
      .populate('generatedBy', 'email')
      .sort({ requestedDate: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get payslip requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/payslip-requests/:organizationId/:id
// @desc    Get single payslip request
// @access  OrgAdmin, SuperAdmin, Employee (own request)
router.get('/:organizationId/:id', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const request = await PayslipRequest.findOne({ _id: id, organizationId })
      .populate('employeeId', 'name email')
      .populate('generatedBy', 'email');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Employees can only view their own requests
    if (req.user.role === 'employee') {
      if (request.employeeId._id.toString() !== String(req.user.employeeId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json({ request });
  } catch (error) {
    console.error('Get payslip request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/payslip-requests/:organizationId/:id/status
// @desc    Update payslip request status (approve/reject)
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/status', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { status, notes } = req.body;

    const request = await PayslipRequest.findOne({ _id: id, organizationId });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!['approved', 'rejected', 'generated'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    request.status = status;
    if (notes) {
      request.notes = notes;
    }

    if (status === 'generated') {
      request.generatedDate = new Date();
      request.generatedBy = req.user._id;
    }

    await request.save();

    const updatedRequest = await PayslipRequest.findById(request._id)
      .populate('employeeId', 'name email')
      .populate('generatedBy', 'email');

    res.json({ request: updatedRequest });
  } catch (error) {
    console.error('Update payslip request error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/payslip-requests/:organizationId/:id
// @desc    Delete payslip request (employee can delete own pending requests)
// @access  Employee (own pending), OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const request = await PayslipRequest.findOne({ _id: id, organizationId });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Employees can only delete their own pending requests
    if (req.user.role === 'employee') {
      if (request.employeeId.toString() !== String(req.user.employeeId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (request.status !== 'pending') {
        return res.status(403).json({ message: 'Can only delete pending requests' });
      }
    }

    await PayslipRequest.deleteOne({ _id: id });

    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Delete payslip request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
