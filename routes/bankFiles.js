import express from 'express';
import BankFile from '../models/BankFile.js';
import Employee from '../models/Employee.js';
import PaymentTracking from '../models/PaymentTracking.js';
import CompanyProfile from '../models/CompanyProfile.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin } from '../middleware/auth.js';
import { generateCPA005, generateCSV } from '../services/cpa005Generator.js';

const router = express.Router();

// @route   GET /api/bank-files/:organizationId/summary
// @desc    Summary stats for bank files
// @access  OrgAdmin, SuperAdmin
// MUST come before /:organizationId/:id
router.get('/:organizationId/summary', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const bankFiles = await BankFile.find({ organizationId: req.params.organizationId });

    const totalFiles = bankFiles.length;
    const totalAmount = bankFiles.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const totalRecords = bankFiles.reduce((sum, f) => sum + (f.totalRecords || 0), 0);

    const byStatus = {};
    bankFiles.forEach(f => {
      byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    });

    res.json({
      summary: {
        totalFiles,
        totalAmount,
        totalRecords,
        byStatus
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/bank-files/:organizationId/preview
// @desc    Preview employees for bank file generation (main org employees only)
// @desc    Only queries the Employee collection - ManualPayslipEmployee is a separate collection
// @desc    and is never included. This ensures bank files only contain real/main employees.
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/preview', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    // Find all REAL employees with bank details from the main Employee collection only.
    // ManualPayslipEmployee records are stored in a completely separate MongoDB collection
    // and are NOT returned by Employee.find(). This guarantees bank files only include
    // main organization employees, not manual payslip / mini-org employees.
    const employees = await Employee.find({
      organizationId: req.params.organizationId,
      isActive: true,
      bankAccountNumber: { $exists: true, $ne: '' },
      bankTransit: { $exists: true, $ne: '' }
    });

    // Build preview data with latest payment amounts
    const previewData = [];
    for (const employee of employees) {
      const latestPayment = await PaymentTracking.findOne({
        employeeId: employee._id,
        organizationId: req.params.organizationId
      }).sort({ paymentDate: -1 });

      const amount = latestPayment ? latestPayment.net : (employee.currentSalary ? employee.currentSalary.net : 0);

      previewData.push({
        employeeId: employee._id,
        employeeName: employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
        bankName: employee.financialInstitution || 'N/A',
        accountNumber: employee.bankAccountNumber,
        transitNumber: employee.bankTransit,
        amount: amount || 0
      });
    }

    res.json({ employees: previewData });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/bank-files/:organizationId/generate
// @desc    Admin generates bank file (CSV or CPA005) - main org employees only
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/generate', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { paymentDate, companyProfileId, fileType } = req.body;

    if (!paymentDate) {
      return res.status(400).json({ message: 'paymentDate is required' });
    }

    // Get company profile if specified - must be the default (main org) profile
    let companyProfile = null;
    if (companyProfileId) {
      companyProfile = await CompanyProfile.findOne({
        _id: companyProfileId,
        organizationId: req.params.organizationId
      });
      if (!companyProfile) {
        return res.status(400).json({ message: 'Company profile not found' });
      }
    }

    // Find all REAL employees with bank details from the main Employee collection
    // ManualPayslipEmployee records are in a separate collection and are NOT included here
    const employees = await Employee.find({
      organizationId: req.params.organizationId,
      isActive: true,
      bankAccountNumber: { $exists: true, $ne: '' },
      bankTransit: { $exists: true, $ne: '' }
    });

    if (employees.length === 0) {
      return res.status(400).json({ message: 'No employees with bank details found' });
    }

    const employeeRecords = [];
    let totalAmount = 0;

    for (const employee of employees) {
      // Get latest payment tracking record for this employee
      // PaymentTracking only contains records from real payroll runs, NOT manual payslips
      const latestPayment = await PaymentTracking.findOne({
        employeeId: employee._id,
        organizationId: req.params.organizationId
      }).sort({ paymentDate: -1 });

      const amount = latestPayment ? latestPayment.net : (employee.currentSalary ? employee.currentSalary.net : 0);

      if (amount > 0) {
        employeeRecords.push({
          employeeId: employee._id,
          name: employee.name,
          bankTransit: employee.bankTransit,
          bankAccountNumber: employee.bankAccountNumber,
          financialInstitution: employee.financialInstitution,
          amount,
          paymentTrackingId: latestPayment ? latestPayment._id : undefined
        });

        totalAmount += amount;
      }
    }

    if (employeeRecords.length === 0) {
      return res.status(400).json({ message: 'No employees with valid payment amounts found' });
    }

    // Determine file type and generate content
    const selectedFileType = (fileType || 'CSV').toUpperCase();
    let fileContent;
    let fileName;
    const dateStr = new Date(paymentDate).toISOString().split('T')[0];

    if (selectedFileType === 'CPA005') {
      // CPA005 format requires a company profile
      if (!companyProfile) {
        return res.status(400).json({ message: 'Company profile is required for CPA005 file generation' });
      }
      fileContent = generateCPA005(companyProfile, employeeRecords);
      fileName = `bank-file-${dateStr}-${Date.now()}.cpa005`;
    } else {
      // Default to CSV
      fileContent = generateCSV(companyProfile, employeeRecords);
      fileName = `bank-file-${dateStr}-${Date.now()}.csv`;
    }

    // Create bank file record
    const bankFile = await BankFile.create({
      organizationId: req.params.organizationId,
      fileType: selectedFileType,
      fileName,
      fileContent,
      paymentDate,
      totalRecords: employeeRecords.length,
      totalAmount,
      companyProfileId: companyProfileId || undefined,
      employees: employeeRecords,
      generatedBy: req.user._id
    });

    res.status(201).json({ bankFile });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/bank-files/:organizationId
// @desc    Admin gets all bank files
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const bankFiles = await BankFile.find({ organizationId: req.params.organizationId })
      .populate('generatedBy', 'email')
      .populate('companyProfileId', 'profileName companyName')
      .select('-fileContent')
      .sort({ createdAt: -1 });

    res.json({ bankFiles });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/bank-files/:organizationId/:id
// @desc    Get single bank file
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const bankFile = await BankFile.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('generatedBy', 'email')
      .populate('companyProfileId', 'profileName companyName')
      .populate('employees.employeeId', 'name email');

    if (!bankFile) {
      return res.status(404).json({ message: 'Bank file not found' });
    }

    res.json({ bankFile });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/bank-files/:organizationId/:id/download
// @desc    Download bank file content
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/:id/download', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const bankFile = await BankFile.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!bankFile) {
      return res.status(404).json({ message: 'Bank file not found' });
    }

    // Mark as downloaded
    if (bankFile.status === 'generated') {
      bankFile.status = 'downloaded';
      await bankFile.save();
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${bankFile.fileName}"`);
    res.send(bankFile.fileContent);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/bank-files/:organizationId/:id/status
// @desc    Admin updates bank file status
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/status', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const validStatuses = ['generated', 'downloaded', 'submitted_to_bank', 'processed', 'error'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const bankFile = await BankFile.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      { status },
      { new: true }
    );

    if (!bankFile) {
      return res.status(404).json({ message: 'Bank file not found' });
    }

    res.json({ bankFile });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
