import express from 'express';
import Offboarding from '../models/Offboarding.js';
import Employee from '../models/Employee.js';
import Asset from '../models/Asset.js';
import LeaveBalance from '../models/LeaveBalance.js';
import Loan from '../models/Loan.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/offboarding/:organizationId/my-offboarding
// @desc    Employee gets own offboarding case
// @access  Employee, OrgAdmin
// MUST come before /:organizationId/:id
router.get('/:organizationId/my-offboarding', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const offboarding = await Offboarding.find({
      organizationId: req.params.organizationId,
      employeeId: req.user.employeeId
    })
      .populate('initiatedBy', 'email')
      .populate('employeeId', 'name email department')
      .sort({ createdAt: -1 });

    res.json({ offboarding });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/offboarding/:organizationId/statistics
// @desc    Admin gets offboarding statistics
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/statistics', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const cases = await Offboarding.find({ organizationId: req.params.organizationId });

    const total = cases.length;

    const byStatus = {};
    cases.forEach(c => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });

    const bySeparationType = {};
    cases.forEach(c => {
      bySeparationType[c.separationType] = (bySeparationType[c.separationType] || 0) + 1;
    });

    // Average notice period (only for cases with noticePeriodDays > 0)
    const casesWithNotice = cases.filter(c => c.noticePeriodDays > 0);
    const avgNoticePeriod = casesWithNotice.length > 0
      ? Math.round(casesWithNotice.reduce((sum, c) => sum + c.noticePeriodDays, 0) / casesWithNotice.length)
      : 0;

    res.json({
      statistics: {
        total,
        byStatus,
        bySeparationType,
        avgNoticePeriod
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/offboarding/:organizationId
// @desc    Admin gets all offboarding cases
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const offboarding = await Offboarding.find({ organizationId: req.params.organizationId })
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ offboarding });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/offboarding/:organizationId/:id
// @desc    Get single offboarding case
// @access  Protected
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('employeeId', 'name email department position annualSalary')
      .populate('initiatedBy', 'email')
      .populate('clearances.assignedTo', 'email')
      .populate('clearances.clearedBy', 'email')
      .populate('assetReturns.assetId')
      .populate('documentHandover.handedOverTo', 'name email')
      .populate('knowledgeTransfer.transferTo', 'name email')
      .populate('exitInterview.conductedBy', 'email')
      .populate('finalSettlement.approvedBy', 'email');

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    res.json({ offboarding });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/offboarding/:organizationId
// @desc    Admin initiates offboarding
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { employeeId, separationType, lastWorkingDate, resignationDate, noticePeriodDays, remarks } = req.body;

    if (!employeeId || !separationType || !lastWorkingDate) {
      return res.status(400).json({ message: 'employeeId, separationType, and lastWorkingDate are required' });
    }

    // Auto-populate asset returns from assigned assets
    const assignedAssets = await Asset.find({ assignedTo: employeeId, status: 'Assigned' });
    const assetReturns = assignedAssets.map(asset => ({
      assetId: asset._id,
      assetName: asset.name,
      status: 'pending'
    }));

    // Set default clearance departments
    const clearances = ['IT', 'HR', 'Finance', 'Admin', 'Manager'].map(dept => ({
      department: dept,
      status: 'pending'
    }));

    const offboarding = await Offboarding.create({
      organizationId: req.params.organizationId,
      employeeId,
      separationType,
      lastWorkingDate,
      resignationDate,
      noticePeriodDays: noticePeriodDays || 0,
      remarks,
      initiatedBy: req.user._id,
      assetReturns,
      clearances
    });

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email');

    res.status(201).json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id
// @desc    Admin updates offboarding details
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    // Prevent overwriting immutable fields
    const { organizationId: _orgId, _id, employeeId: _empId, initiatedBy: _initiator, ...updateData } = req.body;

    const offboarding = await Offboarding.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true }
    )
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email');

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    res.json({ offboarding });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id/clearance/:index
// @desc    Admin updates specific clearance by array index
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/clearance/:index', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    if (index < 0 || index >= offboarding.clearances.length) {
      return res.status(400).json({ message: 'Invalid clearance index' });
    }

    const { status, remarks } = req.body;

    if (status) offboarding.clearances[index].status = status;
    if (remarks !== undefined) offboarding.clearances[index].remarks = remarks;

    if (status === 'cleared') {
      offboarding.clearances[index].clearedBy = req.user._id;
      offboarding.clearances[index].clearedDate = new Date();
    }

    await offboarding.save();

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .populate('clearances.assignedTo', 'email')
      .populate('clearances.clearedBy', 'email');

    res.json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id/asset-return/:index
// @desc    Admin updates specific asset return by array index
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/asset-return/:index', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    if (index < 0 || index >= offboarding.assetReturns.length) {
      return res.status(400).json({ message: 'Invalid asset return index' });
    }

    const { status, returnedDate, condition, remarks } = req.body;

    if (status) offboarding.assetReturns[index].status = status;
    if (returnedDate) offboarding.assetReturns[index].returnedDate = returnedDate;
    if (condition) offboarding.assetReturns[index].condition = condition;
    if (remarks !== undefined) offboarding.assetReturns[index].remarks = remarks;

    await offboarding.save();

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .populate('assetReturns.assetId');

    res.json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id/document-handover/:index
// @desc    Admin updates document handover
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/document-handover/:index', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    if (index < 0 || index >= offboarding.documentHandover.length) {
      return res.status(400).json({ message: 'Invalid document handover index' });
    }

    const { documentName, handedOverTo, status, completedDate } = req.body;

    if (documentName) offboarding.documentHandover[index].documentName = documentName;
    if (handedOverTo) offboarding.documentHandover[index].handedOverTo = handedOverTo;
    if (status) offboarding.documentHandover[index].status = status;
    if (status === 'completed') {
      offboarding.documentHandover[index].completedDate = completedDate || new Date();
    }

    await offboarding.save();

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .populate('documentHandover.handedOverTo', 'name email');

    res.json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id/knowledge-transfer/:index
// @desc    Admin updates KT item
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/knowledge-transfer/:index', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    if (index < 0 || index >= offboarding.knowledgeTransfer.length) {
      return res.status(400).json({ message: 'Invalid knowledge transfer index' });
    }

    const { topic, transferTo, status, notes, completedDate } = req.body;

    if (topic) offboarding.knowledgeTransfer[index].topic = topic;
    if (transferTo) offboarding.knowledgeTransfer[index].transferTo = transferTo;
    if (status) offboarding.knowledgeTransfer[index].status = status;
    if (notes !== undefined) offboarding.knowledgeTransfer[index].notes = notes;
    if (status === 'completed') {
      offboarding.knowledgeTransfer[index].completedDate = completedDate || new Date();
    }

    await offboarding.save();

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .populate('knowledgeTransfer.transferTo', 'name email');

    res.json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id/exit-interview
// @desc    Admin saves exit interview data
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/exit-interview', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    const { scheduled, scheduledDate, conductedBy, completed, reasonForLeaving, feedback, wouldRecommend, rating } = req.body;

    if (scheduled !== undefined) offboarding.exitInterview.scheduled = scheduled;
    if (scheduledDate) offboarding.exitInterview.scheduledDate = scheduledDate;
    if (conductedBy) offboarding.exitInterview.conductedBy = conductedBy;
    if (completed !== undefined) offboarding.exitInterview.completed = completed;
    if (reasonForLeaving) offboarding.exitInterview.reasonForLeaving = reasonForLeaving;
    if (feedback) offboarding.exitInterview.feedback = feedback;
    if (wouldRecommend !== undefined) offboarding.exitInterview.wouldRecommend = wouldRecommend;
    if (rating !== undefined) offboarding.exitInterview.rating = rating;

    await offboarding.save();

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .populate('exitInterview.conductedBy', 'email');

    res.json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/offboarding/:organizationId/:id/calculate-settlement
// @desc    Auto-calculate final settlement
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/:id/calculate-settlement', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    // Get employee salary
    const employee = await Employee.findById(offboarding.employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const annualSalary = employee.annualSalary || 0;
    const dailyRate = annualSalary / 260; // 260 working days per year

    // Get unused leave balance for current year
    const currentYear = new Date().getFullYear();
    const leaveBalances = await LeaveBalance.find({
      employeeId: offboarding.employeeId,
      organizationId: req.params.organizationId,
      year: currentYear
    });

    const totalUnusedLeaveDays = leaveBalances.reduce((sum, lb) => sum + (lb.availableDays || 0), 0);
    const leaveEncashment = Math.round(totalUnusedLeaveDays * dailyRate * 100) / 100;

    // Get outstanding loans
    const activeLoans = await Loan.find({
      employeeId: offboarding.employeeId,
      organizationId: req.params.organizationId,
      status: 'active'
    });

    const loanRecovery = activeLoans.reduce((sum, loan) => sum + (loan.remainingBalance || 0), 0);

    // Calculate remaining salary (assumes full month if not specified)
    const remainingSalary = employee.currentSalary ? (employee.currentSalary.gross || 0) : (annualSalary / 12);

    // Allow admin to pass bonus, deductions, and otherDeductions
    const bonus = req.body.bonus || offboarding.finalSettlement.bonus || 0;
    const deductions = req.body.deductions || offboarding.finalSettlement.deductions || 0;
    const otherDeductions = req.body.otherDeductions || offboarding.finalSettlement.otherDeductions || 0;

    // Calculate total settlement including all components
    const totalSettlement = Math.round(
      (remainingSalary + leaveEncashment + bonus - loanRecovery - deductions - otherDeductions) * 100
    ) / 100;

    // Update offboarding record
    offboarding.finalSettlement.remainingSalary = remainingSalary;
    offboarding.finalSettlement.leaveEncashment = leaveEncashment;
    offboarding.finalSettlement.leaveDaysEncashed = totalUnusedLeaveDays;
    offboarding.finalSettlement.bonus = bonus;
    offboarding.finalSettlement.deductions = deductions;
    offboarding.finalSettlement.otherDeductions = otherDeductions;
    offboarding.finalSettlement.loanRecovery = loanRecovery;
    offboarding.finalSettlement.totalSettlement = totalSettlement;
    offboarding.finalSettlement.status = 'calculated';

    await offboarding.save();

    res.json({
      offboarding,
      settlementDetails: {
        remainingSalary,
        leaveEncashment,
        leaveDaysEncashed: totalUnusedLeaveDays,
        bonus,
        deductions,
        otherDeductions,
        loanRecovery,
        totalSettlement,
        dailyRate: Math.round(dailyRate * 100) / 100
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/offboarding/:organizationId/:id/approve-settlement
// @desc    Admin approves settlement
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/approve-settlement', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    if (offboarding.finalSettlement.status !== 'calculated') {
      return res.status(400).json({ message: 'Settlement must be calculated before approval' });
    }

    offboarding.finalSettlement.status = 'approved';
    offboarding.finalSettlement.approvedBy = req.user._id;
    offboarding.status = 'pending_settlement';
    await offboarding.save();

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email')
      .populate('finalSettlement.approvedBy', 'email');

    res.json({ offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/offboarding/:organizationId/:id/complete
// @desc    Mark offboarding complete
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/:id/complete', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const offboarding = await Offboarding.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!offboarding) {
      return res.status(404).json({ message: 'Offboarding case not found' });
    }

    offboarding.status = 'completed';
    offboarding.completedDate = new Date();
    await offboarding.save();

    // Set employee as inactive
    const updatedEmployee = await Employee.findByIdAndUpdate(
      offboarding.employeeId,
      { isActive: false },
      { new: true }
    );

    if (!updatedEmployee) {
      return res.status(404).json({ message: 'Employee not found while completing offboarding' });
    }

    const populated = await Offboarding.findById(offboarding._id)
      .populate('employeeId', 'name email department')
      .populate('initiatedBy', 'email');

    res.json({ message: 'Offboarding completed', offboarding: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
