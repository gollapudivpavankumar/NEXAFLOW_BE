import express from 'express';
import ManualPayslipEmployee from '../models/ManualPayslipEmployee.js';
import { protect, orgAdminOrSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/manual-payslip-employees/profile/:companyProfileId
// @desc    Get all employees for a company profile
// @access  OrgAdmin, SuperAdmin
router.get('/profile/:companyProfileId', protect, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { companyProfileId } = req.params;

    const employees = await ManualPayslipEmployee.find({ companyProfileId })
      .populate('createdBy', 'name email')
      .sort({ isDefault: -1, employeeName: 1 });

    res.json({ success: true, employees });
  } catch (error) {
    console.error('Get manual payslip employees error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/manual-payslip-employees/:organizationId
// @desc    Create new manual payslip employee
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { companyProfileId, employeeName, employeeEmail, employeeAddress, employeePosition, province, isDefault } = req.body;

    // If setting as default, unset other defaults for this profile
    if (isDefault === 'true' || isDefault === true) {
      await ManualPayslipEmployee.updateMany(
        { companyProfileId, isDefault: true },
        { isDefault: false }
      );
    }

    const employee = await ManualPayslipEmployee.create({
      companyProfileId,
      organizationId,
      employeeName,
      employeeEmail,
      employeeAddress,
      employeePosition,
      province,
      isDefault: isDefault === 'true' || isDefault === true,
      createdBy: req.user._id
    });

    const populatedEmployee = await ManualPayslipEmployee.findById(employee._id)
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, employee: populatedEmployee });
  } catch (error) {
    console.error('Create manual payslip employee error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PUT /api/manual-payslip-employees/:organizationId/:id
// @desc    Update manual payslip employee
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { employeeName, employeeEmail, employeeAddress, employeePosition, province, isDefault } = req.body;

    const employee = await ManualPayslipEmployee.findById(id);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Check ownership
    if (employee.organizationId.toString() !== organizationId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // If setting as default, unset other defaults
    if ((isDefault === 'true' || isDefault === true) && !employee.isDefault) {
      await ManualPayslipEmployee.updateMany(
        { companyProfileId: employee.companyProfileId, isDefault: true },
        { isDefault: false }
      );
    }

    employee.employeeName = employeeName || employee.employeeName;
    employee.employeeEmail = employeeEmail || employee.employeeEmail;
    employee.employeeAddress = employeeAddress || employee.employeeAddress;
    employee.employeePosition = employeePosition || employee.employeePosition;
    employee.province = province || employee.province;
    employee.isDefault = isDefault === 'true' || isDefault === true;

    await employee.save();

    const updatedEmployee = await ManualPayslipEmployee.findById(employee._id)
      .populate('createdBy', 'name email');

    res.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.error('Update manual payslip employee error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/manual-payslip-employees/:organizationId/:id
// @desc    Delete manual payslip employee
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const employee = await ManualPayslipEmployee.findById(id);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Check ownership
    if (employee.organizationId.toString() !== organizationId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await ManualPayslipEmployee.findByIdAndDelete(id);

    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete manual payslip employee error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
