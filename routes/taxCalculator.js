import express from 'express';
import { protect, orgAdminOrSuperAdmin } from '../middleware/auth.js';
import CRAPayrollScraper from '../services/taxCalculator.js';

const router = express.Router();

// Singleton instance - reused across all requests for session pooling
const scraperInstance = new CRAPayrollScraper();

/**
 * @route   POST /api/tax-calculator/calculate
 * @desc    Calculate taxes using the CRA scraper (JavaScript/Selenium)
 * @access  Private (OrgAdmin or SuperAdmin)
 * @body    { grossSalary: number, province: string, paymentDate: { year, month, day } }
 * @return  {
 *   input: { gross_salary, province, payment_date, calculation_timestamp },
 *   employee_info: { province, pay_period_frequency, payment_date, federal_td1, provincial_td1 },
 *   income: { salary_or_wages },
 *   tax_deductions: { federal_tax, provincial_tax, total_tax },
 *   other_deductions: { cpp, cpp2, ei },
 *   totals: { total_cash_income, total_deductions, net_amount }
 * }
 */
router.post('/calculate', protect, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { grossSalary, province, paymentDate, payPeriodFrequency } = req.body;

    // Validate input
    if (!grossSalary || !province || !paymentDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: grossSalary, province, paymentDate'
      });
    }

    if (typeof grossSalary !== 'number' || grossSalary <= 0) {
      return res.status(400).json({
        success: false,
        message: 'grossSalary must be a positive number'
      });
    }

    // Validate paymentDate structure
    if (!paymentDate.year || !paymentDate.month || !paymentDate.day) {
      return res.status(400).json({
        success: false,
        message: 'paymentDate must include year, month, and day'
      });
    }

    // Validate pay period frequency if provided
    const validFrequencies = Object.keys(CRAPayrollScraper.PAY_FREQUENCIES);
    const frequency = payPeriodFrequency || 'MONTHLY_12PP';
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payPeriodFrequency. Must be one of: ${validFrequencies.join(', ')}`
      });
    }

    console.log('Calculating taxes:', {
      grossSalary,
      province,
      paymentDate,
      payPeriodFrequency: frequency
    });

    // Use singleton scraper instance (reuses sessions!)
    const results = await scraperInstance.calculate(
      parseFloat(grossSalary),
      province,
      paymentDate,
      frequency
    );

    console.log('Tax calculation completed successfully');
    console.log('📤 Returning to frontend:', JSON.stringify(results, null, 2));

    // Return structured response
    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Tax calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during tax calculation',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/tax-calculator/provinces
 * @desc    Get list of supported provinces
 * @access  Public
 */
router.get('/provinces', (req, res) => {
  const provinces = [
    { value: 'Alberta', label: 'Alberta' },
    { value: 'British Columbia', label: 'British Columbia' },
    { value: 'Manitoba', label: 'Manitoba' },
    { value: 'New Brunswick', label: 'New Brunswick' },
    { value: 'Newfoundland and Labrador', label: 'Newfoundland and Labrador' },
    { value: 'Nova Scotia', label: 'Nova Scotia' },
    { value: 'Ontario', label: 'Ontario' },
    { value: 'Prince Edward Island', label: 'Prince Edward Island' },
    { value: 'Quebec', label: 'Quebec' },
    { value: 'Saskatchewan', label: 'Saskatchewan' },
    { value: 'Northwest Territories', label: 'Northwest Territories' },
    { value: 'Nunavut', label: 'Nunavut' },
    { value: 'Yukon', label: 'Yukon' }
  ];

  res.json({
    success: true,
    data: provinces
  });
});

/**
 * @route   GET /api/tax-calculator/pay-frequencies
 * @desc    Get list of supported pay period frequencies (matching CRA)
 * @access  Public
 */
router.get('/pay-frequencies', (req, res) => {
  const frequencies = Object.entries(CRAPayrollScraper.PAY_FREQUENCIES).map(([value, info]) => ({
    value,
    label: info.label,
    periodsPerYear: info.periods
  }));

  res.json({
    success: true,
    data: frequencies
  });
});

/**
 * @route   GET /api/tax-calculator/compensation-types
 * @desc    Get list of supported compensation types
 * @access  Public
 */
router.get('/compensation-types', (req, res) => {
  const compensationTypes = [
    { value: 'salaried', label: 'Salaried', description: 'Fixed salary per pay period' },
    { value: 'hourly', label: 'Hourly', description: 'Paid based on hours worked' },
    { value: 'contractor', label: 'Contractor', description: 'Independent contractor (T4A)' },
    { value: 'self-employed-commission', label: 'Self-Employed Commission', description: 'Commission-based self-employed worker' }
  ];

  res.json({
    success: true,
    data: compensationTypes
  });
});

export default router;
