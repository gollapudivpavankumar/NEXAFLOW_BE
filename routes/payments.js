import express from 'express';
import PaymentTracking from '../models/PaymentTracking.js';
import Employee from '../models/Employee.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import CRAPayrollScraper from '../services/taxCalculator.js';
import { generateMonthlyPaymentsForOrganization } from '../services/monthlyPaymentGenerator.js';
import XLSX from 'xlsx';

const router = express.Router();

// Singleton instance - reused across all payroll runs for session pooling
const scraperInstance = new CRAPayrollScraper();

/**
 * Helper function to calculate taxes for a specific month
 * @param {number} grossSalary - Gross salary/pay amount
 * @param {string} province - Province of employment
 * @param {Date} paymentDate - Date of payment
 * @param {string} payPeriodFrequency - Pay period frequency (default: MONTHLY_12PP)
 */
async function calculateTaxesForMonth(grossSalary, province, paymentDate, payPeriodFrequency = 'MONTHLY_12PP') {
  try {
    const paymentDateObj = {
      year: paymentDate.getFullYear().toString(),
      month: (paymentDate.getMonth() + 1).toString().padStart(2, '0'),
      day: paymentDate.getDate().toString().padStart(2, '0')
    };

    console.log('Calculating taxes for month:', { grossSalary, province, paymentDateObj, payPeriodFrequency });

    const scraper = new CRAPayrollScraper();
    const results = await scraper.calculate(grossSalary, province, paymentDateObj, payPeriodFrequency);

    const parseValue = (str) => {
      if (!str) return 0;
      return parseFloat(str.toString().replace(/[CA$,\s]/g, '')) || 0;
    };

    return {
      gross: grossSalary,
      net: parseValue(results.totals?.net_amount),
      federalTax: parseValue(results.tax_deductions?.federal_tax),
      provincialTax: parseValue(results.tax_deductions?.provincial_tax),
      totalTax: parseValue(results.tax_deductions?.total_tax),
      cpp: parseValue(results.other_deductions?.cpp),
      cpp2: parseValue(results.other_deductions?.cpp2),
      ei: parseValue(results.other_deductions?.ei),
      remittance: parseValue(results.totals?.total_deductions)
    };
  } catch (error) {
    console.error('Tax calculation error for month:', error);
    throw error;
  }
}

// @route   GET /api/payments/:organizationId/employee/:employeeId
// @desc    Get all payments for a specific employee
// @access  Private - MUST come before /:organizationId/:id
router.get('/:organizationId/employee/:employeeId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;

    // Verify employee belongs to organization
    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const payments = await PaymentTracking.find({ employeeId, organizationId })
      .populate('employeeId')
      .sort({ paymentDate: -1 });

    res.json({ payments });
  } catch (error) {
    console.error('Get employee payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/payments/:organizationId/export-payments
// @desc    Export existing payments to XLSX - MUST come before /:organizationId/:id
// @access  Private - OrgAdmin, SuperAdmin
router.get('/:organizationId/export-payments', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { startDate, endDate, employeeId } = req.query;

    // Build query
    const query = { organizationId };

    if (startDate && endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.paymentDate = {
        $gte: new Date(startDate),
        $lte: endOfDay
      };
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    const payments = await PaymentTracking.find(query)
      .populate('employeeId')
      .sort({ paymentDate: -1 });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create data
    const wsData = [
      ['Payment History Export'],
      [`Generated: ${new Date().toLocaleString()}`],
      [''],
      ['Employee', 'File #', 'Payment Date', 'Gross Pay', 'Vacation', 'Federal Tax', 'Provincial Tax', 'CPP', 'EI', 'Total Tax', 'Net Pay', 'Bank/Cash', 'Notes']
    ];

    payments.forEach(p => {
      wsData.push([
        p.employeeId?.name || 'Unknown',
        p.employeeId?.fileNumber || '',
        p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '',
        p.grossPay?.toFixed(2) || '0.00',
        p.vacationPayGross?.toFixed(2) || '0.00',
        p.federalTax?.toFixed(2) || '0.00',
        p.provincialTax?.toFixed(2) || '0.00',
        p.cpp?.toFixed(2) || '0.00',
        p.ei?.toFixed(2) || '0.00',
        p.tax?.toFixed(2) || '0.00',
        p.net?.toFixed(2) || '0.00',
        p.bankCash || '',
        p.notes || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Payments');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Payment_History_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export payments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/payments/:organizationId
// @desc    Get all payments for an organization
// @access  Private
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const payments = await PaymentTracking.find({ organizationId })
      .populate('employeeId')
      .sort({ paymentDate: -1 });

    res.json({ payments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/payments/:organizationId
// @desc    Create new payment record
// @access  Private
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const {
      employeeId,
      grossPay,
      vacationPayGross,
      net,
      tax,
      federalTax,
      provincialTax,
      cpp,
      ei,
      remittance,
      oldBalance,
      received,
      bankCash,
      paymentDate,
      notes
    } = req.body;

    // Validate required fields
    if (!employeeId) {
      return res.status(400).json({ message: 'Please provide employee ID' });
    }

    // Verify employee belongs to organization
    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found in this organization' });
    }

    // Create payment record
    const payment = await PaymentTracking.create({
      employeeId,
      organizationId,
      grossPay: grossPay || 0,
      vacationPayGross: vacationPayGross || 0,
      net: net || 0,
      tax: tax || 0,
      federalTax: federalTax || 0,
      provincialTax: provincialTax || 0,
      cpp: cpp || 0,
      ei: ei || 0,
      remittance: remittance || 0,
      oldBalance: oldBalance || 0,
      received: received || 0,
      bankCash: bankCash || '',
      paymentDate: paymentDate || Date.now(),
      notes
    });

    await payment.populate('employeeId');

    res.status(201).json({
      message: 'Payment record created successfully',
      payment
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/payments/:organizationId/:id
// @desc    Get single payment record
// @access  Private
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const payment = await PaymentTracking.findOne({ _id: id, organizationId })
      .populate('employeeId');

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/payments/:organizationId/:id
// @desc    Update payment record
// @access  Private
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const payment = await PaymentTracking.findOne({ _id: id, organizationId });

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    // Update fields
    const allowedFields = [
      'grossPay', 'vacationPayGross', 'net', 'tax', 'federalTax', 'provincialTax',
      'cpp', 'ei', 'remittance', 'oldBalance', 'received', 'bankCash', 'paymentDate', 'notes'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        payment[field] = req.body[field];
      }
    });

    await payment.save();
    await payment.populate('employeeId');

    res.json({
      message: 'Payment record updated successfully',
      payment
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/payments/:organizationId/:id
// @desc    Delete payment record
// @access  Private
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const payment = await PaymentTracking.findOne({ _id: id, organizationId });

    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    await PaymentTracking.findByIdAndDelete(id);

    res.json({ message: 'Payment record deleted successfully' });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/payments/:organizationId/generate-previous
// @desc    Generate previous payment records for an employee based on salary history
// @access  Private
router.post('/:organizationId/generate-previous', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { employeeId, startMonth, endMonth } = req.body;

    // Verify employee belongs to organization
    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found in this organization' });
    }

    if (!employee.currentSalary || !employee.currentSalary.gross) {
      return res.status(400).json({ message: 'Employee does not have salary configured' });
    }

    // Parse dates
    const start = new Date(startMonth);
    const end = new Date(endMonth);
    const now = new Date();

    // Validation checks
    if (start > end) {
      return res.status(400).json({ message: 'Start month must be before end month' });
    }

    if (end > now) {
      return res.status(400).json({ message: 'End month cannot be in the future' });
    }

    // Calculate number of months
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    if (monthsDiff > 36) {
      return res.status(400).json({
        message: `Cannot generate more than 36 months at once. You requested ${monthsDiff} months. Please use smaller date ranges.`
      });
    }

    // Generate payment records for each month - calling scraper for EACH month
    const paymentsToCreate = [];
    const failedMonths = [];
    // Use day 1 to avoid month-skip bugs when setMonth wraps (e.g. Jan 31 -> Mar 3)
    let currentDate = new Date(start.getFullYear(), start.getMonth(), 1);
    let totalMonths = 0;

    console.log(`Starting payment generation for ${employee.name} from ${start.toISOString()} to ${end.toISOString()}`);

    while (currentDate <= end) {
      totalMonths++;
      const monthStr = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

      // Check if payment already exists for this month
      const existingPayment = await PaymentTracking.findOne({
        employeeId,
        organizationId,
        paymentDate: {
          $gte: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
          $lt: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        }
      });

      if (!existingPayment) {
        // Find applicable gross salary from history for this month
        // Sort history by effectiveDate descending and find most recent salary effective at or before this month
        const sortedHistory = (employee.salaryHistory || [])
          .filter(h => new Date(h.effectiveDate) <= currentDate)
          .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

        const applicableGrossSalary = sortedHistory[0]?.gross || employee.currentSalary.gross;

        // Last day of the month as payment date
        const paymentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        try {
          console.log(`Calculating taxes for ${monthStr} with gross CA$${applicableGrossSalary}, frequency: ${employee.payPeriodFrequency || 'MONTHLY_12PP'}`);

          // CALL SCRAPER FOR THIS SPECIFIC MONTH - pass pay period frequency
          const taxData = await calculateTaxesForMonth(
            applicableGrossSalary,
            employee.province,
            paymentDate,
            employee.payPeriodFrequency || 'MONTHLY_12PP'
          );

          paymentsToCreate.push({
            employeeId,
            organizationId,
            grossPay: taxData.gross,
            vacationPayGross: 0,
            net: taxData.net,
            tax: taxData.totalTax,
            federalTax: taxData.federalTax,
            provincialTax: taxData.provincialTax,
            cpp: taxData.cpp,
            ei: taxData.ei,
            remittance: taxData.remittance,
            oldBalance: 0,
            received: 0,
            bankCash: '',
            paymentDate,
            notes: `Auto-generated for ${monthStr} (taxes calculated for ${paymentDate.toISOString().split('T')[0]})`
          });

          console.log(`✓ Successfully calculated taxes for ${monthStr}`);
        } catch (error) {
          console.error(`✗ Failed to calculate taxes for ${monthStr}:`, error.message);
          failedMonths.push({
            month: monthStr,
            monthDate: currentDate.toISOString().split('T')[0],
            error: error.message
          });
          // Continue with next month (skip failed month)
        }
      } else {
        console.log(`Skipping ${monthStr} - payment already exists`);
      }

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    if (paymentsToCreate.length === 0) {
      if (failedMonths.length > 0) {
        return res.status(400).json({
          message: `Failed to generate any payments. ${failedMonths.length} month(s) failed.`,
          totalMonths,
          successCount: 0,
          failedCount: failedMonths.length,
          failedMonths
        });
      }
      return res.status(400).json({
        message: 'No payments to generate. All months already have payment records.'
      });
    }

    // Bulk create successful payments
    const createdPayments = await PaymentTracking.insertMany(paymentsToCreate);

    const responseMessage = failedMonths.length > 0
      ? `Generated ${createdPayments.length} of ${totalMonths} payment(s). ${failedMonths.length} month(s) failed.`
      : `Successfully generated ${createdPayments.length} payment record(s)`;

    res.status(201).json({
      message: responseMessage,
      totalMonths,
      successCount: createdPayments.length,
      failedCount: failedMonths.length,
      failedMonths: failedMonths.length > 0 ? failedMonths : undefined,
      payments: createdPayments
    });
  } catch (error) {
    console.error('Generate previous payments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/payments/:organizationId/generate-current-month
// @desc    Manually trigger monthly payment generation for current month
// @access  Private - OrgAdmin, SuperAdmin
router.post('/:organizationId/generate-current-month', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    console.log(`Manual trigger: Generating current month payments for organization ${organizationId}`);

    const result = await generateMonthlyPaymentsForOrganization(organizationId);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Generate current month payments error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/payments/:organizationId/run-payroll
// @desc    Run payroll for a specific period - generates draft payroll for all employees
// @access  Private - OrgAdmin, SuperAdmin
router.post('/:organizationId/run-payroll', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { payPeriodStart, payPeriodEnd, payDate } = req.body;

    // Validate dates
    if (!payPeriodStart || !payPeriodEnd || !payDate) {
      return res.status(400).json({ message: 'Pay period start, end, and pay date are required' });
    }

    const periodStart = new Date(payPeriodStart);
    const periodEnd = new Date(payPeriodEnd);
    const paymentDate = new Date(payDate);

    // Get all active employees
    const employees = await Employee.find({ organizationId, isActive: true });

    if (employees.length === 0) {
      return res.status(400).json({ message: 'No active employees found' });
    }

    console.log(`Running payroll for ${employees.length} employees, pay date: ${payDate}`);

    const payrollData = [];
    const errors = [];

    for (const employee of employees) {
      try {
        // Determine gross pay based on compensation type
        let grossPay = 0;
        let regularHours = 0;
        let otHours = 0;

        if (employee.compensationType === 'hourly') {
          // For hourly, calculate based on standard hours if no timesheet
          regularHours = employee.standardHoursPerPay || 0;
          grossPay = (employee.baseRatePerHour || 0) * regularHours;
        } else if (employee.compensationType === 'salaried') {
          // For salaried, use salary per pay
          grossPay = employee.salaryPerPay || employee.currentSalary?.gross || 0;
        } else {
          // Contractors and commission - use current salary if set
          grossPay = employee.salaryPerPay || employee.currentSalary?.gross || 0;
        }

        if (grossPay <= 0) {
          errors.push({
            employeeId: employee._id,
            name: employee.name,
            error: 'No salary/rate configured'
          });
          continue;
        }

        // Calculate taxes using CRA scraper
        const paymentDateObj = {
          year: paymentDate.getFullYear().toString(),
          month: (paymentDate.getMonth() + 1).toString().padStart(2, '0'),
          day: paymentDate.getDate().toString().padStart(2, '0')
        };

        let taxData;
        try {
          // Use singleton scraper instance (reuses sessions!)
          const results = await scraperInstance.calculate(
            grossPay,
            employee.province,
            paymentDateObj,
            employee.payPeriodFrequency || 'MONTHLY_12PP'
          );

          const parseValue = (str) => {
            if (!str) return 0;
            return parseFloat(str.toString().replace(/[CA$,\s]/g, '')) || 0;
          };

          taxData = {
            federalTax: parseValue(results.tax_deductions?.federal_tax),
            provincialTax: parseValue(results.tax_deductions?.provincial_tax),
            totalTax: parseValue(results.tax_deductions?.total_tax),
            cpp: parseValue(results.other_deductions?.cpp),
            cpp2: parseValue(results.other_deductions?.cpp2),
            ei: parseValue(results.other_deductions?.ei),
            net: parseValue(results.totals?.net_amount),
            remittance: parseValue(results.totals?.total_deductions)
          };
        } catch (calcError) {
          // Use stored tax data as fallback
          taxData = {
            federalTax: employee.currentSalary?.federalTax || 0,
            provincialTax: employee.currentSalary?.provincialTax || 0,
            totalTax: employee.currentSalary?.totalTax || 0,
            cpp: employee.currentSalary?.cpp || 0,
            cpp2: employee.currentSalary?.cpp2 || 0,
            ei: employee.currentSalary?.ei || 0,
            net: employee.currentSalary?.net || grossPay,
            remittance: employee.currentSalary?.remittance || 0
          };
          console.log(`Using stored tax data for ${employee.name}: ${calcError.message}`);
        }

        // Calculate vacation pay
        const vacationPay = employee.vacationPayMethod === 'payout_every_pay_period'
          ? grossPay * ((employee.vacationAccrualRate || 4) / 100)
          : 0;

        payrollData.push({
          employeeId: employee._id,
          fileNumber: employee.fileNumber || '',
          name: employee.name,
          department: employee.department || '',
          compensationType: employee.compensationType || 'salaried',
          payPeriodFrequency: employee.payPeriodFrequency || 'MONTHLY_12PP',
          province: employee.province,
          regularHours: regularHours,
          otHours: otHours,
          baseRate: employee.compensationType === 'hourly' ? employee.baseRatePerHour : employee.salaryPerPay,
          grossPay: grossPay,
          vacationPay: vacationPay,
          federalTax: taxData.federalTax,
          provincialTax: taxData.provincialTax,
          cpp: taxData.cpp + (taxData.cpp2 || 0),
          ei: taxData.ei,
          totalDeductions: taxData.federalTax + taxData.provincialTax + taxData.cpp + (taxData.cpp2 || 0) + taxData.ei,
          netPay: taxData.net,
          remittance: taxData.remittance,
          bankTransit: employee.bankTransit || '',
          bankAccountNumber: employee.bankAccountNumber || '',
          paymentMethod: employee.bankAccountNumber ? 'Direct Deposit' : 'Cheque',
          status: 'draft'
        });
      } catch (error) {
        errors.push({
          employeeId: employee._id,
          name: employee.name,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Payroll generated for ${payrollData.length} employee(s)`,
      payPeriod: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        payDate: paymentDate.toISOString()
      },
      summary: {
        totalEmployees: employees.length,
        processed: payrollData.length,
        errors: errors.length,
        totalGross: payrollData.reduce((sum, p) => sum + p.grossPay, 0),
        totalNet: payrollData.reduce((sum, p) => sum + p.netPay, 0),
        totalTax: payrollData.reduce((sum, p) => sum + p.totalDeductions, 0),
        totalVacation: payrollData.reduce((sum, p) => sum + p.vacationPay, 0)
      },
      payroll: payrollData,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Run payroll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/payments/:organizationId/confirm-payroll
// @desc    Confirm payroll and create payment records
// @access  Private - OrgAdmin, SuperAdmin
router.post('/:organizationId/confirm-payroll', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { payroll, payDate } = req.body;

    if (!payroll || !Array.isArray(payroll) || payroll.length === 0) {
      return res.status(400).json({ message: 'Payroll data is required' });
    }

    const paymentDate = new Date(payDate);
    const paymentsToCreate = [];

    for (const item of payroll) {
      paymentsToCreate.push({
        employeeId: item.employeeId,
        organizationId,
        grossPay: item.grossPay,
        vacationPayGross: item.vacationPay || 0,
        net: item.netPay,
        tax: item.totalDeductions,
        federalTax: item.federalTax,
        provincialTax: item.provincialTax,
        cpp: item.cpp,
        ei: item.ei,
        remittance: item.remittance,
        oldBalance: 0,
        received: item.netPay, // Mark as paid
        bankCash: item.paymentMethod === 'Direct Deposit' ? 'bank' : 'cash',
        paymentDate: paymentDate,
        notes: `Payroll run - ${paymentDate.toLocaleDateString('en-CA')}`
      });
    }

    const createdPayments = await PaymentTracking.insertMany(paymentsToCreate);

    // Update each employee's currentSalary with the latest calculated taxes
    for (const item of payroll) {
      try {
        await Employee.findByIdAndUpdate(item.employeeId, {
          currentSalary: {
            gross: item.grossPay,
            federalTax: item.federalTax,
            provincialTax: item.provincialTax,
            totalTax: item.totalDeductions,
            cpp: item.cpp,
            ei: item.ei,
            net: item.netPay,
            remittance: item.remittance,
            calculatedBy: 'calculator',
            effectiveDate: paymentDate
          }
        });
      } catch (updateError) {
        console.error(`Failed to update employee ${item.employeeId} currentSalary:`, updateError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdPayments.length} payment records and updated employee records`,
      payments: createdPayments
    });
  } catch (error) {
    console.error('Confirm payroll error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/payments/:organizationId/export-xlsx
// @desc    Export payments to XLSX format (Employee Summary style like ADP)
// @access  Private - OrgAdmin, SuperAdmin
router.post('/:organizationId/export-xlsx', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { payroll, payPeriod, companyName, weekNumber } = req.body;

    if (!payroll || !Array.isArray(payroll)) {
      return res.status(400).json({ message: 'Payroll data is required' });
    }

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create header rows (ADP style)
    const headerData = [
      ['', '', '', '', '', '', '', '', 'Employee Summary', '', '', '', '', '', '', ''],
      [`Company: ${companyName || 'Company'}`, '', '', '', '', '', '', '', `Pay Date: ${payPeriod?.payDate || new Date().toLocaleDateString()}`, '', '', '', '', `Status: Complete`, '', ''],
      [`Week#: ${weekNumber || Math.ceil((new Date().getDate()) / 7)}`, '', '', '', '', '', '', '', `P/E Date: ${payPeriod?.end || new Date().toLocaleDateString()}`, '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['File #', 'Name', 'Home Department', 'Comp Type', 'Pay Freq', 'Total Reg. Hours', 'Total OT Hours', 'Total Hours 3&4', 'Total Reg. Earnings', 'Total OT Earnings', 'Vacation Pay', 'Gross Pay', 'Total Taxes', 'Total Deductions', 'Total Deposits', 'Net Pay']
    ];

    // Add payroll data
    const payrollRows = payroll.map(p => [
      p.fileNumber || '',
      p.name,
      p.department || '',
      p.compensationType || 'salaried',
      p.payPeriodFrequency || 'MONTHLY_12PP',
      p.regularHours || 0,
      p.otHours || 0,
      0,
      p.grossPay?.toFixed(2) || '0.00',
      '0.00',
      p.vacationPay?.toFixed(2) || '0.00',
      p.grossPay?.toFixed(2) || '0.00',
      p.totalDeductions?.toFixed(2) || '0.00',
      p.totalDeductions?.toFixed(2) || '0.00',
      p.netPay?.toFixed(2) || '0.00',
      p.netPay?.toFixed(2) || '0.00'
    ]);

    // Add totals row
    const totals = payroll.reduce((acc, p) => ({
      regularHours: acc.regularHours + (p.regularHours || 0),
      otHours: acc.otHours + (p.otHours || 0),
      grossPay: acc.grossPay + (p.grossPay || 0),
      vacationPay: acc.vacationPay + (p.vacationPay || 0),
      totalDeductions: acc.totalDeductions + (p.totalDeductions || 0),
      netPay: acc.netPay + (p.netPay || 0)
    }), { regularHours: 0, otHours: 0, grossPay: 0, vacationPay: 0, totalDeductions: 0, netPay: 0 });

    const totalsRow = [
      'TOTALS',
      '',
      '',
      '',
      '',
      totals.regularHours.toFixed(2),
      totals.otHours.toFixed(2),
      '0.00',
      totals.grossPay.toFixed(2),
      '0.00',
      totals.vacationPay.toFixed(2),
      totals.grossPay.toFixed(2),
      totals.totalDeductions.toFixed(2),
      totals.totalDeductions.toFixed(2),
      totals.netPay.toFixed(2),
      totals.netPay.toFixed(2)
    ];

    // Combine all data
    const wsData = [...headerData, ...payrollRows, [], totalsRow];

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 10 }, // File #
      { wch: 30 }, // Name
      { wch: 15 }, // Department
      { wch: 12 }, // Comp Type
      { wch: 12 }, // Pay Freq
      { wch: 12 }, // Reg Hours
      { wch: 12 }, // OT Hours
      { wch: 12 }, // Hours 3&4
      { wch: 15 }, // Reg Earnings
      { wch: 15 }, // OT Earnings
      { wch: 12 }, // Vacation
      { wch: 12 }, // Gross
      { wch: 12 }, // Taxes
      { wch: 15 }, // Deductions
      { wch: 12 }, // Deposits
      { wch: 12 }  // Net
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Summary');

    // Create bank payment sheet
    const bankData = [
      ['Bank Payment File'],
      [`Generated: ${new Date().toLocaleString()}`],
      [''],
      ['Employee Name', 'Bank Transit', 'Account Number', 'Amount', 'Reference']
    ];

    payroll.forEach((p, idx) => {
      if (p.bankAccountNumber) {
        bankData.push([
          p.name,
          p.bankTransit || '',
          p.bankAccountNumber,
          p.netPay?.toFixed(2) || '0.00',
          `PAY${(idx + 1).toString().padStart(6, '0')}`
        ]);
      }
    });

    const wsBankData = XLSX.utils.aoa_to_sheet(bankData);
    wsBankData['!cols'] = [
      { wch: 30 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, wsBankData, 'Bank Payments');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Payroll_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export XLSX error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
