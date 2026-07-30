import express from 'express';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { colorFromString } from '../utils/avatarColor.js';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';
import PaymentTracking from '../models/PaymentTracking.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import CRAPayrollScraper from '../services/taxCalculator.js';

const router = express.Router();

/**
 * Helper function to calculate taxes using JavaScript Selenium scraper
 * @param {number} grossSalary - Gross salary amount
 * @param {string} province - Province for tax calculation
 * @param {Date} paymentDate - Payment date (optional)
 * @param {string} payPeriodFrequency - Pay period frequency (default: MONTHLY_12PP)
 */
async function calculateTaxes(grossSalary, province, paymentDate = null, payPeriodFrequency = 'MONTHLY_12PP') {
  try {
    const date = paymentDate || new Date();
    const paymentDateObj = {
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString().padStart(2, '0'),
      day: date.getDate().toString().padStart(2, '0')
    };

    console.log('Calculating taxes with JavaScript scraper:', { grossSalary, province, paymentDateObj, payPeriodFrequency });

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
      employerCpp: 0,
      employerEi: 0,
      remittance: parseValue(results.totals?.total_deductions),
      effectiveDate: date,
      calculatedBy: 'calculator',
      payPeriodFrequency: payPeriodFrequency
    };
  } catch (error) {
    console.error('Tax calculation error:', error);
    throw new Error('Failed to calculate taxes: ' + error.message);
  }
}

// @route   POST /api/employees/:organizationId/with-login
// @desc    Create new employee with login credentials and leave balances
// @access  Private - OrgAdmin, SuperAdmin
router.post('/:organizationId/with-login', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const {
      // Personal Information (Step 1)
      firstName,
      middleName,
      lastName,
      name,
      preferredName,
      email,
      phone,
      addressLine1,
      addressLine2,
      city,
      postalCode,
      birthDate,
      preferredLanguage,
      sin,
      sinNotProvided,
      // Employment Information (Step 2)
      fileNumber,
      position,
      jobTitle,
      department,
      location,
      province,
      joiningDate,
      selfServiceAccess,
      // Pay Information (Step 3)
      compensationType,
      payPeriodFrequency,
      useTimesheets,
      calculateOvertimeAuto,
      calculateHolidayPayAuto,
      timeZone,
      badgeNumber,
      salaryPerPay,
      standardHoursPerPay,
      baseRatePerHour,
      annualSalary,
      bankAccountNumber,
      bankTransit,
      financialInstitution,
      wsibContribute,
      dentalBenefitsCoverageCode,
      isIncorporated,
      createT4A,
      recipientProgramAccountNumber,
      recipientProgramAccountNotProvided,
      vacationAccrualRate,
      vacationPayMethod,
      // Legacy fields
      notes,
      grossSalary,
      useCalculator = true,
      currentSalary,
      // Login options
      password,
      createLogin,
      // Grants the Jira Dashboard alongside the ERP login. Ignored unless a
      // login is being created, and rejected if the org never bought it.
      taskhubAccess = false,
      generateHistoricalPayments = false
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Please provide employee name' });
    }
    if (!province) {
      return res.status(400).json({ message: 'Please provide province for tax calculations' });
    }
    if (!joiningDate) {
      return res.status(400).json({ message: 'Please provide joining date' });
    }

    // Validate joining date is not in the future
    const joiningDateObj = new Date(joiningDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day for fair comparison
    if (joiningDateObj > now) {
      return res.status(400).json({ message: 'Joining date cannot be in the future' });
    }

    if (!grossSalary && !currentSalary) {
      return res.status(400).json({ message: 'Please provide gross salary or salary details' });
    }

    // If creating login, email and password are required
    if (createLogin) {
      if (!email) {
        return res.status(400).json({ message: 'Email is required for login access' });
      }
      if (!password) {
        return res.status(400).json({ message: 'Password is required for login access' });
      }

      // Check if email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists. Please use a different email.' });
      }

      // An admin cannot grant a product the organization does not hold. Fail
      // loudly rather than silently dropping the checkbox they just ticked.
      if (taskhubAccess) {
        const org = await Organization.findById(organizationId).select('packages');
        const packages = org?.packages?.length ? org.packages : ['hrm'];
        if (!packages.includes('taskhub')) {
          return res.status(403).json({
            message: 'Your organization does not have the Jira Dashboard package. Contact support to add it.',
            missingPackage: 'taskhub'
          });
        }
      }
    }

    let salaryData;

    // Determine the gross salary to use for tax calculation
    const grossForCalculation = grossSalary || salaryPerPay || (baseRatePerHour * (standardHoursPerPay || 0));
    const frequencyForCalculation = payPeriodFrequency || 'MONTHLY_12PP';

    // Calculate taxes if requested and gross salary provided
    if (useCalculator && grossForCalculation) {
      try {
        console.log('Calculating taxes for employee:', { grossForCalculation, province, frequencyForCalculation });
        salaryData = await calculateTaxes(grossForCalculation, province, new Date(joiningDate), frequencyForCalculation);
        console.log('Tax calculation successful:', salaryData);
      } catch (calcError) {
        console.error('Tax calculation error:', calcError);
        return res.status(400).json({
          message: 'Tax calculation failed. Please provide salary details manually or try again.',
          error: calcError.message
        });
      }
    } else if (currentSalary) {
      salaryData = {
        ...currentSalary,
        calculatedBy: 'manual',
        effectiveDate: new Date(joiningDate)
      };
    } else {
      return res.status(400).json({ message: 'Please provide salary details' });
    }

    // Determine the actual gross salary based on compensation type
    const effectiveGross = grossSalary || salaryPerPay || (baseRatePerHour * (standardHoursPerPay || 0)) || 0;

    // Create employee with all ADP WFN-style fields
    const employee = await Employee.create({
      organizationId,
      // Personal Information
      firstName: firstName || '',
      middleName: middleName || '',
      lastName: lastName || '',
      name,
      preferredName: preferredName || '',
      email: email || null,
      phone: phone || '',
      addressLine1: addressLine1 || '',
      addressLine2: addressLine2 || '',
      city: city || '',
      postalCode: postalCode || '',
      birthDate: birthDate ? new Date(birthDate) : null,
      preferredLanguage: preferredLanguage || 'English',
      sin: sin || '',
      sinNotProvided: sinNotProvided || false,
      // Employment Information
      fileNumber: fileNumber || '',
      position: position || '',
      jobTitle: jobTitle || '',
      department: department || '',
      location: location || '',
      province,
      joiningDate: new Date(joiningDate),
      selfServiceAccess: selfServiceAccess || false,
      // Pay Information
      compensationType: compensationType || 'salaried',
      payPeriodFrequency: payPeriodFrequency || 'MONTHLY_12PP',
      useTimesheets: useTimesheets || false,
      calculateOvertimeAuto: calculateOvertimeAuto || false,
      calculateHolidayPayAuto: calculateHolidayPayAuto || false,
      timeZone: timeZone || 'EST - Eastern Standard Time',
      badgeNumber: badgeNumber || '',
      salaryPerPay: salaryPerPay || effectiveGross,
      standardHoursPerPay: standardHoursPerPay || 0,
      baseRatePerHour: baseRatePerHour || 0,
      annualSalary: annualSalary || 0,
      bankAccountNumber: bankAccountNumber || '',
      bankTransit: bankTransit || '',
      financialInstitution: financialInstitution || '',
      wsibContribute: wsibContribute || false,
      dentalBenefitsCoverageCode: dentalBenefitsCoverageCode || '',
      isIncorporated: isIncorporated || false,
      createT4A: createT4A !== false,
      recipientProgramAccountNumber: recipientProgramAccountNumber || '',
      recipientProgramAccountNotProvided: recipientProgramAccountNotProvided || false,
      vacationAccrualRate: vacationAccrualRate || 4,
      vacationPayMethod: vacationPayMethod || 'payout_every_pay_period',
      notes: notes || '',
      currentSalary: salaryData,
      salaryHistory: [{
        ...salaryData,
        changedBy: req.user._id,
        notes: 'Initial salary upon joining'
      }]
    });

    let createdUser = null;

    // Create user account if requested
    if (createLogin) {
      try {
        createdUser = await User.create({
          email,
          password,
          // Mirrored onto the User so chat, meetings and the Jira Dashboard can
          // show a name without reaching into payroll data.
          name,
          title: jobTitle || position || '',
          avatarColor: colorFromString(email),
          role: 'employee',
          organizationId,
          employeeId: employee._id,
          moduleAccess: { taskhub: Boolean(taskhubAccess) }
        });
      } catch (userCreateError) {
        // Clean up the already-created employee since login creation failed
        await Employee.findByIdAndDelete(employee._id);
        return res.status(400).json({
          message: 'Failed to create login account. Employee was not created.',
          error: userCreateError.message
        });
      }

      // Update employee with userId
      employee.userId = createdUser._id;
      await employee.save();

      // Get all leave types for this organization
      const leaveTypes = await LeaveType.find({ organizationId, isActive: true });

      // Create leave balances for each leave type
      const currentYear = new Date().getFullYear();
      for (const leaveType of leaveTypes) {
        await LeaveBalance.create({
          employeeId: employee._id,
          organizationId,
          leaveTypeId: leaveType._id,
          year: currentYear,
          totalDays: leaveType.daysPerYear,
          usedDays: 0
        });
      }
    }

    // Generate historical payments if requested - calling scraper for EACH month
    let generatedPaymentsCount = 0;
    let failedPaymentsCount = 0;
    if (generateHistoricalPayments) {
      try {
        const historicalStartDate = new Date(joiningDate);
        const currentDateObj = new Date();

        // Calculate number of months to prevent excessive generation
        const monthsDiff = (currentDateObj.getFullYear() - historicalStartDate.getFullYear()) * 12 +
                          (currentDateObj.getMonth() - historicalStartDate.getMonth()) + 1;

        if (monthsDiff > 36) {
          console.log(`Historical payment generation skipped: ${monthsDiff} months exceeds 36 month limit`);
          // Don't fail employee creation, just skip historical generation
        } else {
          console.log(`Generating historical payments for ${employee.name} from ${historicalStartDate.toISOString()} to ${currentDateObj.toISOString()}`);

          // Generate payments from joining month to current month
          const paymentsToCreate = [];
          let monthDate = new Date(historicalStartDate.getFullYear(), historicalStartDate.getMonth(), 1);

        while (monthDate <= currentDateObj) {
          const monthStr = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

          // Check if payment already exists for this month
          const existingPayment = await PaymentTracking.findOne({
            employeeId: employee._id,
            organizationId,
            paymentDate: {
              $gte: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
              $lt: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
            }
          });

          if (!existingPayment) {
            // Use last day of month as payment date
            const paymentDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

            try {
              console.log(`Calculating taxes for ${monthStr} with gross CA$${salaryData.gross}`);

              // CALL SCRAPER FOR THIS SPECIFIC MONTH
              const monthTaxData = await calculateTaxes(salaryData.gross, province, paymentDate);

              paymentsToCreate.push({
                employeeId: employee._id,
                organizationId,
                grossPay: monthTaxData.gross || 0,
                vacationPayGross: 0,
                net: monthTaxData.net || 0,
                tax: monthTaxData.totalTax || 0,
                federalTax: monthTaxData.federalTax || 0,
                provincialTax: monthTaxData.provincialTax || 0,
                cpp: monthTaxData.cpp || 0,
                ei: monthTaxData.ei || 0,
                remittance: monthTaxData.remittance || 0,
                oldBalance: 0,
                received: 0,
                bankCash: '',
                paymentDate,
                notes: `Auto-generated for ${monthStr} (taxes calculated for ${paymentDate.toISOString().split('T')[0]})`
              });

              console.log(`✓ Successfully calculated taxes for ${monthStr}`);
            } catch (monthError) {
              console.error(`✗ Failed to calculate taxes for ${monthStr}:`, monthError.message);
              failedPaymentsCount++;
              // Continue with next month (skip failed month)
            }
          } else {
            console.log(`Skipping ${monthStr} - payment already exists`);
          }

          // Move to next month
          monthDate.setMonth(monthDate.getMonth() + 1);
        }

          if (paymentsToCreate.length > 0) {
            const createdPayments = await PaymentTracking.insertMany(paymentsToCreate);
            generatedPaymentsCount = createdPayments.length;
            console.log(`Generated ${generatedPaymentsCount} historical payment records for employee ${employee.name}`);
            if (failedPaymentsCount > 0) {
              console.log(`${failedPaymentsCount} month(s) failed during historical payment generation`);
            }
          }
        }
      } catch (paymentError) {
        console.error('Error generating historical payments:', paymentError);
        // Don't fail employee creation if payment generation fails
      }
    }

    res.status(201).json({
      message: createLogin
        ? 'Employee created successfully with login access and leave balances'
        : 'Employee created successfully',
      employee,
      loginCreated: createLogin,
      taskhubAccess: Boolean(createLogin && taskhubAccess),
      userEmail: createdUser ? createdUser.email : null,
      historicalPaymentsGenerated: generatedPaymentsCount,
      historicalPaymentsFailed: failedPaymentsCount > 0 ? failedPaymentsCount : undefined
    });
  } catch (error) {
    console.error('Create employee with login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/employees/:organizationId/:employeeId/module-access
// @desc    Turn optional product access on or off for an existing employee
// @access  Private - OrgAdmin, SuperAdmin
//
// Registered here rather than in employees.js because it edits the User record
// (identity and entitlement) rather than the Employee record (payroll data).
router.put('/:organizationId/:employeeId/module-access', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;
    const { taskhub } = req.body;

    if (typeof taskhub !== 'boolean') {
      return res.status(400).json({ message: 'taskhub must be true or false' });
    }

    const employee = await Employee.findOne({ _id: employeeId, organizationId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (!employee.userId) {
      return res.status(400).json({
        message: 'This employee has no login. Create login access before granting the Jira Dashboard.'
      });
    }

    if (taskhub) {
      const org = await Organization.findById(organizationId).select('packages');
      const packages = org?.packages?.length ? org.packages : ['hrm'];
      if (!packages.includes('taskhub')) {
        return res.status(403).json({
          message: 'Your organization does not have the Jira Dashboard package. Contact support to add it.',
          missingPackage: 'taskhub'
        });
      }
    }

    const user = await User.findById(employee.userId);
    if (!user) {
      return res.status(404).json({ message: 'Linked login account not found' });
    }

    user.moduleAccess = { ...(user.moduleAccess || {}), taskhub };
    // Backfill display fields for accounts created before they existed, so the
    // person shows up properly the moment they open the dashboard.
    if (!user.name) user.name = employee.name;
    if (!user.avatarColor) user.avatarColor = colorFromString(user.email);
    await user.save();

    res.json({
      message: taskhub ? 'Jira Dashboard access granted' : 'Jira Dashboard access removed',
      employeeId: String(employee._id),
      userId: String(user._id),
      moduleAccess: { taskhub: Boolean(user.moduleAccess?.taskhub) }
    });
  } catch (error) {
    console.error('Update module access error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
