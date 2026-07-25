import express from 'express';
import Loan from '../models/Loan.js';
import LoanRepayment from '../models/LoanRepayment.js';
import Employee from '../models/Employee.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/loans/:organizationId/my-loans
// @desc    Employee gets own loans
// @access  Employee, OrgAdmin
// MUST come before /:organizationId/:id
router.get('/:organizationId/my-loans', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const loans = await Loan.find({
      organizationId: req.params.organizationId,
      employeeId: req.user.employeeId
    })
      .populate('approvedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ loans });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/loans/:organizationId/request
// @desc    Employee/OrgAdmin creates loan request
// @access  Employee, OrgAdmin
router.post('/:organizationId/request', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { loanType, amount, installments, reason } = req.body;

    if (!loanType || !amount || !installments) {
      return res.status(400).json({ message: 'loanType, amount, and installments are required' });
    }

    // Determine employeeId
    let employeeId = req.body.employeeId;
    if (req.user.role === 'employee') {
      employeeId = req.user.employeeId;
    }

    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    // Calculate interest rate based on loan type
    const interestRateMap = {
      'salary_advance': 0,
      'personal_loan': 5,
      'emergency_loan': 0,
      'education_loan': 3,
      'other': 5
    };

    const interestRate = interestRateMap[loanType] !== undefined ? interestRateMap[loanType] : 5;
    const totalRepayable = amount * (1 + interestRate / 100);
    const installmentAmount = Math.ceil(totalRepayable / installments);

    const loan = await Loan.create({
      organizationId: req.params.organizationId,
      employeeId,
      loanType,
      amount,
      interestRate,
      totalRepayable,
      installments,
      installmentAmount,
      remainingBalance: totalRepayable,
      reason,
      createdBy: req.user._id
    });

    res.status(201).json({ loan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/loans/:organizationId/statistics
// @desc    Admin gets loan statistics
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/statistics', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const loans = await Loan.find({ organizationId });

    const totalLoans = loans.length;
    const activeLoans = loans.filter(l => l.status === 'active').length;
    const pendingApproval = loans.filter(l => l.status === 'pending').length;
    const totalDisbursed = loans
      .filter(l => ['active', 'completed'].includes(l.status))
      .reduce((sum, l) => sum + l.amount, 0);
    const totalRecovered = loans.reduce((sum, l) => sum + (l.paidAmount || 0), 0);

    res.json({
      statistics: {
        totalLoans,
        activeLoans,
        totalDisbursed,
        totalRecovered,
        pendingApproval
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/loans/:organizationId
// @desc    Admin gets all loans
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const loans = await Loan.find({ organizationId: req.params.organizationId })
      .populate('employeeId', 'name email')
      .populate('approvedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ loans });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/loans/:organizationId/:id
// @desc    Get single loan with repayments
// @access  Protected
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const loan = await Loan.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('employeeId', 'name email department')
      .populate('approvedBy', 'email');

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const repayments = await LoanRepayment.find({ loanId: req.params.id })
      .sort({ paymentDate: -1 });

    res.json({ loan, repayments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/loans/:organizationId/:id/approve
// @desc    Admin approves loan
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/approve', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const loan = await Loan.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'pending') {
      return res.status(400).json({ message: 'Loan is not in pending status' });
    }

    loan.status = 'active';
    loan.approvedBy = req.user._id;
    loan.approvedDate = new Date();
    loan.disbursementDate = new Date();
    if (req.body.approvalComments) {
      loan.approvalComments = req.body.approvalComments;
    }
    await loan.save();

    res.json({ loan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/loans/:organizationId/:id/reject
// @desc    Admin rejects loan
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/reject', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const loan = await Loan.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'pending') {
      return res.status(400).json({ message: 'Loan is not in pending status' });
    }

    loan.status = 'rejected';
    loan.approvedBy = req.user._id;
    loan.approvalComments = req.body.approvalComments || '';
    await loan.save();

    res.json({ loan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/loans/:organizationId/:id/repayment
// @desc    Admin records repayment
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/:id/repayment', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { amount, paymentDate, paymentMethod, notes } = req.body;

    if (!amount || !paymentDate) {
      return res.status(400).json({ message: 'Amount and paymentDate are required' });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const loan = await Loan.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'active') {
      return res.status(400).json({ message: 'Loan is not active' });
    }

    if (amount > loan.remainingBalance) {
      return res.status(400).json({ message: `Repayment amount (${amount}) exceeds remaining balance (${loan.remainingBalance})` });
    }

    // Calculate installment number
    const existingRepayments = await LoanRepayment.countDocuments({ loanId: loan._id });
    const installmentNumber = existingRepayments + 1;

    // Update loan balances
    loan.paidAmount = (loan.paidAmount || 0) + amount;
    loan.remainingBalance = loan.remainingBalance - amount;

    const balanceAfterPayment = loan.remainingBalance;

    if (loan.remainingBalance <= 0) {
      loan.remainingBalance = 0;
      loan.status = 'completed';
      loan.completedDate = new Date();
    }

    await loan.save();

    // Create repayment record
    const repayment = await LoanRepayment.create({
      organizationId: req.params.organizationId,
      loanId: loan._id,
      employeeId: loan.employeeId,
      amount,
      paymentDate,
      paymentMethod: paymentMethod || 'manual',
      installmentNumber,
      balanceAfterPayment: balanceAfterPayment < 0 ? 0 : balanceAfterPayment,
      notes
    });

    res.status(201).json({ repayment, loan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/loans/:organizationId/:id/repayments
// @desc    Get all repayments for a loan
// @access  Protected
router.get('/:organizationId/:id/repayments', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const repayments = await LoanRepayment.find({ loanId: req.params.id })
      .sort({ paymentDate: -1 });

    res.json({ repayments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/loans/:organizationId/:id
// @desc    Admin cancels loan
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const loan = await Loan.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (['completed', 'cancelled'].includes(loan.status)) {
      return res.status(400).json({ message: `Cannot cancel a loan that is already ${loan.status}` });
    }

    loan.status = 'cancelled';
    await loan.save();

    res.json({ message: 'Loan cancelled successfully', loan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
