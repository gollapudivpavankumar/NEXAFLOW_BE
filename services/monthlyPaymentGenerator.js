import cron from 'node-cron';
import Employee from '../models/Employee.js';
import PaymentTracking from '../models/PaymentTracking.js';
import CRAPayrollScraper from './taxCalculator.js';

/**
 * Helper function to calculate taxes for a specific month
 */
async function calculateTaxesForMonth(grossSalary, province, paymentDate) {
  try {
    const paymentDateObj = {
      year: paymentDate.getFullYear().toString(),
      month: (paymentDate.getMonth() + 1).toString().padStart(2, '0'),
      day: paymentDate.getDate().toString().padStart(2, '0')
    };

    console.log('Calculating taxes for month:', { grossSalary, province, paymentDateObj });

    const scraper = new CRAPayrollScraper();
    const results = await scraper.calculate(grossSalary, province, paymentDateObj);

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

/**
 * Generate monthly payments for all active employees in an organization
 */
export async function generateMonthlyPaymentsForOrganization(organizationId) {
  console.log(`\n========================================`);
  console.log(`Starting monthly payment generation for organization: ${organizationId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`========================================\n`);

  try {
    // Get current month details
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const paymentDate = new Date(currentYear, currentMonth + 1, 0); // Last day of current month
    const monthStr = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    console.log(`Generating payments for: ${monthStr}`);
    console.log(`Payment date: ${paymentDate.toISOString().split('T')[0]}\n`);

    // Get all active employees for this organization
    const employees = await Employee.find({
      organizationId,
      isActive: true
    });

    if (employees.length === 0) {
      console.log('No active employees found for this organization');
      return {
        success: true,
        message: 'No active employees to process',
        employeeCount: 0,
        paymentsGenerated: 0,
        paymentsFailed: 0
      };
    }

    console.log(`Found ${employees.length} active employee(s)\n`);

    let paymentsGenerated = 0;
    let paymentsFailed = 0;
    let employeesSkipped = 0;
    const failedEmployees = [];

    for (const employee of employees) {
      try {
        console.log(`Processing: ${employee.name} (${employee.email || 'no email'})`);

        // Check if payment already exists for this month
        const existingPayment = await PaymentTracking.findOne({
          employeeId: employee._id,
          organizationId,
          paymentDate: {
            $gte: new Date(currentYear, currentMonth, 1),
            $lt: new Date(currentYear, currentMonth + 1, 1)
          }
        });

        if (existingPayment) {
          console.log(`  → Skipped: Payment already exists for ${monthStr}`);
          employeesSkipped++;
          continue;
        }

        // Check if employee has salary configured
        if (!employee.currentSalary || !employee.currentSalary.gross) {
          console.log(`  → Skipped: No salary configured`);
          employeesSkipped++;
          continue;
        }

        // Calculate taxes for this month
        console.log(`  → Calculating taxes with gross CA$${employee.currentSalary.gross}`);
        const taxData = await calculateTaxesForMonth(
          employee.currentSalary.gross,
          employee.province,
          paymentDate
        );

        // Create payment record
        await PaymentTracking.create({
          employeeId: employee._id,
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
          notes: `Auto-generated monthly payment for ${monthStr} (taxes calculated for ${paymentDate.toISOString().split('T')[0]})`
        });

        paymentsGenerated++;
        console.log(`  ✓ Payment generated successfully`);
      } catch (employeeError) {
        paymentsFailed++;
        console.error(`  ✗ Failed to generate payment for ${employee.name}:`, employeeError.message);
        failedEmployees.push({
          employeeName: employee.name,
          employeeId: employee._id.toString(),
          error: employeeError.message
        });
      }
    }

    console.log(`\n========================================`);
    console.log(`Monthly Payment Generation Complete`);
    console.log(`========================================`);
    console.log(`Total employees: ${employees.length}`);
    console.log(`Payments generated: ${paymentsGenerated}`);
    console.log(`Employees skipped: ${employeesSkipped}`);
    console.log(`Payments failed: ${paymentsFailed}`);
    console.log(`========================================\n`);

    return {
      success: true,
      message: `Generated ${paymentsGenerated} payment(s) for ${monthStr}`,
      month: monthStr,
      paymentDate: paymentDate.toISOString().split('T')[0],
      employeeCount: employees.length,
      paymentsGenerated,
      employeesSkipped,
      paymentsFailed,
      failedEmployees: failedEmployees.length > 0 ? failedEmployees : undefined
    };
  } catch (error) {
    console.error('Error in monthly payment generation:', error);
    return {
      success: false,
      message: 'Monthly payment generation failed',
      error: error.message
    };
  }
}

/**
 * Generate monthly payments for all organizations
 */
export async function generateMonthlyPaymentsForAllOrganizations() {
  console.log('\n' + '='.repeat(60));
  console.log('AUTOMATIC MONTHLY PAYMENT GENERATION - ALL ORGANIZATIONS');
  console.log('Triggered at:', new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  try {
    // Get unique organization IDs from active employees
    const organizations = await Employee.distinct('organizationId', { isActive: true });

    if (organizations.length === 0) {
      console.log('No organizations with active employees found');
      return {
        success: true,
        message: 'No organizations to process',
        organizationsProcessed: 0
      };
    }

    console.log(`Found ${organizations.length} organization(s) with active employees\n`);

    const results = [];
    for (const orgId of organizations) {
      const result = await generateMonthlyPaymentsForOrganization(orgId);
      results.push({
        organizationId: orgId.toString(),
        ...result
      });
    }

    const totalGenerated = results.reduce((sum, r) => sum + (r.paymentsGenerated || 0), 0);
    const totalFailed = results.reduce((sum, r) => sum + (r.paymentsFailed || 0), 0);

    console.log('\n' + '='.repeat(60));
    console.log('ALL ORGANIZATIONS - SUMMARY');
    console.log('='.repeat(60));
    console.log(`Organizations processed: ${organizations.length}`);
    console.log(`Total payments generated: ${totalGenerated}`);
    console.log(`Total payments failed: ${totalFailed}`);
    console.log('='.repeat(60) + '\n');

    return {
      success: true,
      message: `Generated ${totalGenerated} payment(s) across ${organizations.length} organization(s)`,
      organizationsProcessed: organizations.length,
      totalGenerated,
      totalFailed,
      results
    };
  } catch (error) {
    console.error('Error in generateMonthlyPaymentsForAllOrganizations:', error);
    return {
      success: false,
      message: 'Failed to generate monthly payments',
      error: error.message
    };
  }
}

/**
 * Initialize the cron job for automatic monthly payment generation
 * Runs on the last day of every month at 11:00 PM
 */
export function initializeMonthlyPaymentScheduler() {
  // Schedule: At 11:00 PM on the last day of every month
  // Using "0 23 28-31 * *" and checking if tomorrow is next month
  const cronExpression = '0 23 28-31 * *';

  console.log('Initializing monthly payment generation scheduler...');
  console.log(`Schedule: ${cronExpression} (11:00 PM on days 28-31, with check for last day)`);

  const task = cron.schedule(cronExpression, async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if tomorrow is the first day of next month (meaning today is last day)
    if (tomorrow.getDate() === 1) {
      console.log('\n🚀 Triggering automatic monthly payment generation (last day of month)');
      await generateMonthlyPaymentsForAllOrganizations();
    }
  }, {
    scheduled: true,
    timezone: "America/Toronto" // Adjust to your timezone
  });

  console.log('✓ Monthly payment scheduler initialized successfully');
  console.log('  Timezone: America/Toronto');
  console.log('  Next run: Last day of month at 11:00 PM\n');

  return task;
}
