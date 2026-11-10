import express from 'express';
import puppeteer from 'puppeteer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import Employee from '../models/Employee.js';
import PayslipTemplate from '../models/PayslipTemplate.js';
import PayslipRequest from '../models/PayslipRequest.js';
import PaymentTracking from '../models/PaymentTracking.js';
import ManualPayslip from '../models/ManualPayslip.js';
import CompanyProfile from '../models/CompanyProfile.js';
import { protect, orgAdminOrSuperAdmin, employeeOrOrgAdmin, checkOrganizationAccess } from '../middleware/auth.js';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/manual-payslips';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

const router = express.Router();

// Helper function to format currency (without $ sign as template has it)
const formatCurrency = (amount) => {
  if (typeof amount !== 'number') return '0.00';
  return amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
};

// Helper to get month name
const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Replace placeholders in template
// Supports both {placeholder} and {{PLACEHOLDER}} formats
const replacePlaceholders = (htmlTemplate, data) => {
  let html = htmlTemplate;

  // FIRST PASS: Replace double braces {{KEY}} for all keys
  // This must happen first to avoid single-brace regex matching inside double braces
  Object.keys(data).forEach(key => {
    const upperKey = key.toUpperCase();
    const regexDouble = new RegExp(`\\{\\{${upperKey}\\}\\}`, 'g');
    html = html.replace(regexDouble, data[key] || '');
  });

  // SECOND PASS: Replace single braces {key} for all keys
  Object.keys(data).forEach(key => {
    const regexSingle = new RegExp(`\\{${key}\\}`, 'g');
    html = html.replace(regexSingle, data[key] || '');
  });

  return html;
};

// Helper function to calculate YTD by summing all payments from Jan 1 to current month
const calculateYTD = async (employeeId, organizationId, monthStr) => {
  const [year, month] = monthStr.split('-');
  const yearInt = parseInt(year);
  const monthInt = parseInt(month);

  // Get all payments from Jan 1 to end of current month
  const startOfYear = new Date(yearInt, 0, 1);
  const endOfMonth = new Date(yearInt, monthInt, 0); // Last day of the month

  const payments = await PaymentTracking.find({
    employeeId,
    organizationId,
    paymentDate: {
      $gte: startOfYear,
      $lte: endOfMonth
    }
  });

  // Sum all the values
  const ytdData = {
    gross: 0,
    net: 0,
    federalTax: 0,
    provincialTax: 0,
    cpp: 0,
    ei: 0
  };

  payments.forEach(payment => {
    ytdData.gross += payment.grossPay || 0;
    ytdData.net += payment.net || 0;
    ytdData.federalTax += payment.federalTax || 0;
    ytdData.provincialTax += payment.provincialTax || 0;
    ytdData.cpp += payment.cpp || 0;
    ytdData.ei += payment.ei || 0;
  });

  return ytdData;
};

// Generate payslip data for replacement
const generatePayslipData = (employee, org, payment, ytdData, monthStr) => {
  const [year, month] = monthStr.split('-');
  const monthInt = parseInt(month);
  const yearInt = parseInt(year);
  const monthName = monthNames[monthInt - 1];

  // Calculate the last day of the month
  const lastDayOfMonth = new Date(yearInt, monthInt, 0).getDate();

  // Extract payment values from actual PaymentTracking record
  const gross = payment.grossPay || 0;
  const net = payment.net || 0;
  const federalTax = payment.federalTax || 0;
  const provincialTax = payment.provincialTax || 0;
  const cpp = payment.cpp || 0;
  const ei = payment.ei || 0;

  // Use calculated YTD values from actual payments
  const ytdGross = ytdData.gross || 0;
  const ytdNet = ytdData.net || 0;
  const ytdFederalTax = ytdData.federalTax || 0;
  const ytdProvincialTax = ytdData.provincialTax || 0;
  const ytdCpp = ytdData.cpp || 0;
  const ytdEi = ytdData.ei || 0;

  // Format logo - create complete img tag to prevent base64 text display
  let companyLogo = '';
  if (org.logo) {
    let logoSrc = '';
    // If logo already has data URI scheme, use as is
    if (org.logo.startsWith('data:')) {
      logoSrc = org.logo;
    } else {
      // If it's just base64 string, add the data URI scheme
      logoSrc = `data:image/png;base64,${org.logo}`;
    }
    // Create complete img tag instead of just the data URI
    companyLogo = `<img src="${logoSrc}" alt="${org.name}" style="max-width: 200px; max-height: 80px;" />`;
  }

  // Prepare data for placeholder replacement
  return {
    // Company/Organization
    company_logo: companyLogo,
    company_name: org.name,
    company_address: org.email,
    company_address_line1: org.addressLine1 || org.email,
    company_address_line2: org.addressLine2 || '',
    company_phone: org.phone || '',

    // Employee
    employee_name: employee.name,
    employee_email: employee.email || '',
    employee_address: employee.email || '',
    employee_position: employee.position || 'N/A',
    employee_location: employee.location || 'N/A',
    employee_province: employee.province || 'N/A',
    joining_date: employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : 'N/A',

    // Period information - use actual last day of month
    period_start: `${monthName} 01, ${year}`,
    period_end: `${monthName} ${lastDayOfMonth}, ${year}`,
    pay_date: `${monthName} ${lastDayOfMonth}, ${year}`,
    generated_date: new Date().toLocaleDateString(),
    month: monthName,
    year: year,

    // Earnings
    hourly_rate: formatCurrency(gross / 160),
    hours_worked: '160',
    gross_pay: formatCurrency(gross),
    year_to_date_gross: formatCurrency(ytdGross),
    gross_pay_ytd: formatCurrency(ytdGross),

    // Deductions
    federal_tax: formatCurrency(federalTax),
    year_to_date_federal_tax: formatCurrency(ytdFederalTax),
    federal_tax_ytd: formatCurrency(ytdFederalTax),
    provincial_tax: formatCurrency(provincialTax),
    year_to_date_provincial_tax: formatCurrency(ytdProvincialTax),
    provincial_tax_ytd: formatCurrency(ytdProvincialTax),
    ei_deduction: formatCurrency(ei),
    year_to_date_ei: formatCurrency(ytdEi),
    ei_deduction_ytd: formatCurrency(ytdEi),
    cpp_deduction: formatCurrency(cpp),
    year_to_date_cpp: formatCurrency(ytdCpp),
    cpp_deduction_ytd: formatCurrency(ytdCpp),

    // Exemptions (placeholder values - can be customized)
    federal_exemption: '1',
    provincial_exemption: '1',

    // Summary
    net_pay: formatCurrency(net),
    year_to_date_net: formatCurrency(ytdNet),
    net_pay_ytd: formatCurrency(ytdNet),

    // Vacation
    vacation_accrual: formatCurrency(gross * 0.04),
    vacation_balance: formatCurrency(gross * 0.08),
    vacation_period: formatCurrency(gross * 0.04),
    vacation_ytd: formatCurrency(gross * 0.08),

    // Bank/Deposit Information
    account_number: employee.bankAccountNumber || 'N/A',
    bank_transit: employee.bankTransit || org.bankTransit || 'N/A',
    bank_name: org.bankName || 'N/A',
    advice_number: `${year}${month}${employee._id.toString().substring(0, 6)}`,
  };
};

// Extract styles and body from template
const extractTemplateComponents = (fullTemplate) => {
  // Extract <style> content
  const styleMatch = fullTemplate.match(/<style>([\s\S]*?)<\/style>/);
  const styles = styleMatch ? styleMatch[1] : '';

  // Extract body content (everything between <body> and </body>)
  const bodyMatch = fullTemplate.match(/<body>([\s\S]*?)<\/body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : fullTemplate;

  return { styles, bodyContent };
};

// @route   POST /api/payslips/:organizationId/generate
// @desc    Generate payslip PDF for employee (admin use)
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/generate', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { employeeId, months, templateId } = req.body;

    console.log('🔍 Generate Payslip Request:', {
      organizationId,
      employeeId,
      months,
      templateId
    });

    if (!employeeId || !months || months.length === 0) {
      return res.status(400).json({ message: 'Employee ID and months are required' });
    }

    const employee = await Employee.findOne({ _id: employeeId, organizationId })
      .populate('organizationId');

    console.log('👤 Employee found:', employee ? `${employee.name} (${employee.email})` : 'NOT FOUND');

    if (!employee) {
      console.log('❌ Employee not found with employeeId:', employeeId, 'and organizationId:', organizationId);
      return res.status(404).json({ message: 'Employee not found' });
    }

    const org = employee.organizationId;

    // Get template from database only
    let templateHTML;
    let selectedTemplate;

    if (templateId) {
      console.log('Using selected template with ID:', templateId);
      selectedTemplate = await PayslipTemplate.findById(templateId);
      if (!selectedTemplate) {
        console.log('Template not found in database for ID:', templateId);
        return res.status(404).json({ message: 'Selected template not found' });
      }
    } else {
      // Find default template for this organization
      console.log('No template selected, looking for default template...');
      selectedTemplate = await PayslipTemplate.findOne({
        $or: [
          { organizationId, isDefault: true, isActive: true },
          { isGlobal: true, isDefault: true, isActive: true }
        ]
      }).sort({ organizationId: -1 }); // Prioritize org-specific over global

      if (!selectedTemplate) {
        console.log('No default template found in database');
        return res.status(400).json({
          message: 'No template found. Please select a template or set a default template in Payslip Templates page.'
        });
      }
    }

    console.log('Using template:', selectedTemplate.name, '(ID:', selectedTemplate._id + ')');
    templateHTML = selectedTemplate.htmlContent;

    // Extract styles and body content from template
    const { styles, bodyContent } = extractTemplateComponents(templateHTML);

    // Generate payslip for each month - fetch actual payment data
    const monthPayslips = [];
    for (let index = 0; index < months.length; index++) {
      const monthStr = months[index];
      const [year, month] = monthStr.split('-');
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);

      // Find PaymentTracking record for this month
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0);

      const payment = await PaymentTracking.findOne({
        employeeId,
        organizationId,
        paymentDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      console.log(`💰 Payment record for ${monthStr}:`, payment ? `Found (${payment.netPay})` : 'NOT FOUND');

      if (!payment) {
        console.log(`❌ No payment record found for employee ${employee.name} for ${monthStr}`);
        console.log(`💡 Tip: Run payroll for this employee for ${monthStr} first, or the employee needs to have been paid for this month.`);
        return res.status(404).json({
          message: `No payment record found for ${monthStr}. Please run payroll for this employee for ${monthStr} first.`
        });
      }

      // Calculate YTD for this month
      const ytdData = await calculateYTD(employeeId, organizationId, monthStr);

      // Generate payslip data with actual payment
      const data = generatePayslipData(employee, org, payment, ytdData, monthStr);
      const filledContent = replacePlaceholders(bodyContent, data);

      // Add page break after each payslip except the last one
      const pageBreak = index < months.length - 1 ? 'page-break-after: always;' : '';
      monthPayslips.push(`<div style="${pageBreak}">${filledContent}</div>`);
    }

    const monthPayslipsHTML = monthPayslips.join('\n');

    // Build complete HTML document
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payslips - ${employee.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        ${styles}

        @page {
            size: A4;
            margin: 0;
        }

        @media print {
            div[style*="page-break-after"] {
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    ${monthPayslipsHTML}
</body>
</html>`;

    // Generate PDF using Puppeteer with print media emulation
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Emulate print media for @media print styles
    await page.emulateMediaType('print');

    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false
    });

    await browser.close();

    // Send PDF as download (use res.end for binary data to avoid JSON serialization)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${employee.name.replace(/\s+/g, '_')}-${months[0]}_to_${months[months.length - 1]}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');

  } catch (error) {
    console.error('Generate payslip PDF error:', error);
    res.status(500).json({ message: 'Server error generating PDF' });
  }
});

// Import CRA scraper for accurate tax calculations (same as payments.js)
import CRAPayrollScraper from '../services/taxCalculator.js';

// Helper to parse CRA response values (same as payments.js)
const parseValue = (str) => {
  if (!str) return 0;
  return parseFloat(str.toString().replace(/[CA$,\s]/g, '')) || 0;
};

/**
 * Calculate taxes for payslip generation using CRA scraper
 * Same approach as payments.js calculateTaxesForMonth
 */
async function calculateTaxesForPayslip(grossSalary, province, paymentDate, payPeriodFrequency = 'MONTHLY_12PP') {
  const paymentDateObj = {
    year: paymentDate.year.toString(),
    month: paymentDate.month.toString().padStart(2, '0'),
    day: paymentDate.day.toString().padStart(2, '0')
  };

  console.log('🧮 Calculating taxes for payslip:', { grossSalary, province, paymentDateObj, payPeriodFrequency });

  const scraper = new CRAPayrollScraper();
  const results = await scraper.calculate(grossSalary, province, paymentDateObj, payPeriodFrequency);

  console.log('📊 CRA calculation result:', JSON.stringify(results, null, 2));

  return {
    gross: grossSalary,
    net: parseValue(results.totals?.net_amount),
    federalTax: parseValue(results.tax_deductions?.federal_tax),
    provincialTax: parseValue(results.tax_deductions?.provincial_tax),
    totalTax: parseValue(results.tax_deductions?.total_tax),
    cpp: parseValue(results.other_deductions?.cpp),
    cpp2: parseValue(results.other_deductions?.cpp2),
    ei: parseValue(results.other_deductions?.ei),
    totalDeductions: parseValue(results.totals?.total_deductions)
  };
}

// Helper to generate payslip data from salary with CRA-calculated deductions
const generatePayslipDataFromSalary = (employee, org, taxResult, monthStr, ytdData) => {
  const [year, month] = monthStr.split('-');
  const monthInt = parseInt(month);
  const yearInt = parseInt(year);
  const monthName = monthNames[monthInt - 1];
  const lastDayOfMonth = new Date(yearInt, monthInt, 0).getDate();

  // Format logo
  let companyLogo = '';
  if (org.logo) {
    let logoSrc = org.logo.startsWith('data:') ? org.logo : `data:image/png;base64,${org.logo}`;
    companyLogo = `<img src="${logoSrc}" alt="${org.name}" style="max-width: 200px; max-height: 80px;" />`;
  }

  return {
    company_logo: companyLogo,
    company_name: org.name,
    company_address: org.email,
    company_address_line1: org.addressLine1 || org.email,
    company_address_line2: org.addressLine2 || '',
    company_phone: org.phone || '',
    employee_name: employee.name,
    employee_email: employee.email || '',
    employee_address: employee.email || '',
    employee_position: employee.position || 'N/A',
    employee_location: employee.location || 'N/A',
    employee_province: employee.province || 'N/A',
    joining_date: employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : 'N/A',
    period_start: `${monthName} 01, ${year}`,
    period_end: `${monthName} ${lastDayOfMonth}, ${year}`,
    pay_date: `${monthName} ${lastDayOfMonth}, ${year}`,
    generated_date: new Date().toLocaleDateString(),
    month: monthName,
    year: year,
    hourly_rate: formatCurrency(taxResult.gross / 160),
    hours_worked: '160',
    gross_pay: formatCurrency(taxResult.gross),
    year_to_date_gross: formatCurrency(ytdData.gross),
    gross_pay_ytd: formatCurrency(ytdData.gross),
    federal_tax: formatCurrency(taxResult.federalTax),
    year_to_date_federal_tax: formatCurrency(ytdData.federalTax),
    federal_tax_ytd: formatCurrency(ytdData.federalTax),
    provincial_tax: formatCurrency(taxResult.provincialTax),
    year_to_date_provincial_tax: formatCurrency(ytdData.provincialTax),
    provincial_tax_ytd: formatCurrency(ytdData.provincialTax),
    ei_deduction: formatCurrency(taxResult.ei),
    year_to_date_ei: formatCurrency(ytdData.ei),
    ei_deduction_ytd: formatCurrency(ytdData.ei),
    cpp_deduction: formatCurrency(taxResult.cpp),
    year_to_date_cpp: formatCurrency(ytdData.cpp),
    cpp_deduction_ytd: formatCurrency(ytdData.cpp),
    federal_exemption: '1',
    provincial_exemption: '1',
    net_pay: formatCurrency(taxResult.net),
    year_to_date_net: formatCurrency(ytdData.net),
    net_pay_ytd: formatCurrency(ytdData.net),
    vacation_accrual: formatCurrency(taxResult.gross * 0.04),
    vacation_balance: formatCurrency(taxResult.gross * 0.08),
    vacation_period: formatCurrency(taxResult.gross * 0.04),
    vacation_ytd: formatCurrency(taxResult.gross * 0.08),
    account_number: employee.bankAccountNumber || 'N/A',
    bank_transit: employee.bankTransit || org.bankTransit || 'N/A',
    bank_name: org.bankName || 'N/A',
    advice_number: `${year}${month}${employee._id.toString().substring(0, 6)}`,
  };
};

// @route   POST /api/payslips/:organizationId/generate-from-salary
// @desc    Generate payslip PDF from employee salary config using CRA scraper (without payroll record)
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/generate-from-salary', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { employeeId, months, templateId } = req.body;

    console.log('🔍 Generate Payslip from Salary Request:', { organizationId, employeeId, months, templateId });

    if (!employeeId || !months || months.length === 0) {
      return res.status(400).json({ message: 'Employee ID and months are required' });
    }

    const employee = await Employee.findOne({ _id: employeeId, organizationId })
      .populate('organizationId');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if employee has salary configured
    if (!employee.currentSalary || !employee.currentSalary.gross || employee.currentSalary.gross <= 0) {
      return res.status(400).json({
        message: 'Employee does not have salary configured. Please set salary in Payroll Updations first.'
      });
    }

    const org = employee.organizationId;
    const grossMonthly = employee.currentSalary.gross;
    const province = employee.province || 'Ontario';

    // Get template
    let templateHTML;
    let selectedTemplate;

    if (templateId) {
      selectedTemplate = await PayslipTemplate.findById(templateId);
      if (!selectedTemplate) {
        return res.status(404).json({ message: 'Selected template not found' });
      }
    } else {
      selectedTemplate = await PayslipTemplate.findOne({
        $or: [
          { organizationId, isDefault: true, isActive: true },
          { isGlobal: true, isDefault: true, isActive: true }
        ]
      }).sort({ organizationId: -1 });

      if (!selectedTemplate) {
        return res.status(400).json({
          message: 'No template found. Please select a template or set a default template in Payslip Templates page.'
        });
      }
    }

    templateHTML = selectedTemplate.htmlContent;
    const { styles, bodyContent } = extractTemplateComponents(templateHTML);

    // Sort months chronologically for proper YTD calculation
    const sortedMonths = [...months].sort();

    // Track YTD values as we process each month
    const ytdData = {
      gross: 0,
      net: 0,
      federalTax: 0,
      provincialTax: 0,
      cpp: 0,
      ei: 0
    };

    // Generate payslip for each month using CRA scraper
    const monthPayslips = [];
    for (let index = 0; index < sortedMonths.length; index++) {
      const monthStr = sortedMonths[index];
      const [year, month] = monthStr.split('-');
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);
      const lastDayOfMonth = new Date(yearInt, monthInt, 0).getDate();

      // Create payment date for CRA scraper based on selected month
      const paymentDate = {
        year: yearInt,
        month: monthInt,
        day: lastDayOfMonth
      };

      console.log(`📅 Processing ${monthStr} with payment date:`, paymentDate);

      // Calculate taxes using CRA scraper with correct date (same as payments.js)
      const taxResult = await calculateTaxesForPayslip(grossMonthly, province, paymentDate, 'MONTHLY_12PP');

      // Update YTD values
      ytdData.gross += taxResult.gross;
      ytdData.net += taxResult.net;
      ytdData.federalTax += taxResult.federalTax;
      ytdData.provincialTax += taxResult.provincialTax;
      ytdData.cpp += taxResult.cpp;
      ytdData.ei += taxResult.ei;

      const data = generatePayslipDataFromSalary(employee, org, taxResult, monthStr, { ...ytdData });
      const filledContent = replacePlaceholders(bodyContent, data);

      const pageBreak = index < sortedMonths.length - 1 ? 'page-break-after: always;' : '';
      monthPayslips.push(`<div style="${pageBreak}">${filledContent}</div>`);
    }

    const monthPayslipsHTML = monthPayslips.join('\n');

    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payslips - ${employee.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        ${styles}
        @page { size: A4; margin: 0; }
        @media print { div[style*="page-break-after"] { page-break-after: always; } }
    </style>
</head>
<body>
    ${monthPayslipsHTML}
</body>
</html>`;

    // Generate PDF
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${employee.name.replace(/\s+/g, '_')}-${sortedMonths[0]}_to_${sortedMonths[sortedMonths.length - 1]}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');

  } catch (error) {
    console.error('Generate payslip from salary error:', error);
    res.status(500).json({ message: 'Server error generating PDF: ' + error.message });
  }
});

// @route   POST /api/payslips/:organizationId/request/:requestId/generate
// @desc    Generate payslip PDF for a request (admin approves and generates)
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/request/:requestId/generate', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, requestId } = req.params;
    const { templateId } = req.body;

    const request = await PayslipRequest.findOne({ _id: requestId, organizationId })
      .populate('employeeId');

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const employee = await Employee.findById(request.employeeId)
      .populate('organizationId');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const org = employee.organizationId;

    // Get template from database only
    let templateHTML;
    let selectedTemplate;

    if (templateId) {
      console.log('Using selected template with ID:', templateId);
      selectedTemplate = await PayslipTemplate.findById(templateId);
      if (!selectedTemplate) {
        console.log('Template not found in database for ID:', templateId);
        return res.status(404).json({ message: 'Selected template not found' });
      }
    } else {
      // Find default template for this organization
      console.log('No template selected for request, looking for default template...');
      selectedTemplate = await PayslipTemplate.findOne({
        $or: [
          { organizationId, isDefault: true, isActive: true },
          { isGlobal: true, isDefault: true, isActive: true }
        ]
      }).sort({ organizationId: -1 }); // Prioritize org-specific over global

      if (!selectedTemplate) {
        console.log('No default template found in database');
        return res.status(400).json({
          message: 'No template found. Please select a template or set a default template in Payslip Templates page.'
        });
      }
    }

    console.log('Using template:', selectedTemplate.name, '(ID:', selectedTemplate._id + ')');
    templateHTML = selectedTemplate.htmlContent;

    // Extract styles and body content
    const { styles, bodyContent } = extractTemplateComponents(templateHTML);

    // Generate payslip for each month in request - fetch actual payment data
    const monthPayslips = [];
    for (let index = 0; index < request.months.length; index++) {
      const monthStr = request.months[index];
      const [year, month] = monthStr.split('-');
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);

      // Find PaymentTracking record for this month
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0);

      const payment = await PaymentTracking.findOne({
        employeeId: request.employeeId,
        organizationId,
        paymentDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      if (!payment) {
        return res.status(404).json({
          message: `No payment record found for ${monthStr}. Cannot generate payslip without payment data.`
        });
      }

      // Calculate YTD for this month
      const ytdData = await calculateYTD(request.employeeId, organizationId, monthStr);

      // Generate payslip data with actual payment
      const data = generatePayslipData(employee, org, payment, ytdData, monthStr);
      const filledContent = replacePlaceholders(bodyContent, data);

      const pageBreak = index < request.months.length - 1 ? 'page-break-after: always;' : '';
      monthPayslips.push(`<div style="${pageBreak}">${filledContent}</div>`);
    }

    const monthPayslipsHTML = monthPayslips.join('\n');

    // Build complete HTML
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payslips - ${employee.name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        ${styles}

        @page {
            size: A4;
            margin: 0;
        }

        @media print {
            div[style*="page-break-after"] {
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    ${monthPayslipsHTML}
</body>
</html>`;

    // Generate PDF with print media emulation
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Emulate print media for @media print styles
    await page.emulateMediaType('print');

    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false
    });

    await browser.close();

    // Update request status
    request.status = 'generated';
    request.generatedDate = new Date();
    request.generatedBy = req.user._id;
    await request.save();

    // Send PDF (use res.end for binary data to avoid JSON serialization)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${employee.name.replace(/\s+/g, '_')}-${request.months[0]}_to_${request.months[request.months.length - 1]}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer, 'binary');

  } catch (error) {
    console.error('Generate payslip from request error:', error);
    res.status(500).json({ message: 'Server error generating PDF' });
  }
});

// @route   GET /api/payslips/:organizationId/employee/:employeeId/preview
// @desc    Preview payslip HTML (for testing)
// @access  OrgAdmin, SuperAdmin, Employee (own)
router.get('/:organizationId/employee/:employeeId/preview', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;
    const { months, templateId } = req.query;

    // Employees can only preview their own
    if (req.user.role === 'employee') {
      if (String(req.user.employeeId) !== employeeId) {
        return res.status(403).send('<h1>Access Denied</h1>');
      }
    }

    const employee = await Employee.findOne({ _id: employeeId, organizationId })
      .populate('organizationId');

    if (!employee) {
      return res.status(404).send('<h1>Employee not found</h1>');
    }

    const org = employee.organizationId;
    const monthsArray = months ? months.split(',') : [];

    if (monthsArray.length === 0) {
      return res.status(400).send('<h1>No months specified</h1>');
    }

    // Get template from database only
    let templateHTML;
    let selectedTemplate;

    if (templateId) {
      selectedTemplate = await PayslipTemplate.findById(templateId);
      if (!selectedTemplate) {
        return res.status(404).send('<h1>Template not found</h1>');
      }
    } else {
      // Find default template for this organization
      selectedTemplate = await PayslipTemplate.findOne({
        $or: [
          { organizationId, isDefault: true, isActive: true },
          { isGlobal: true, isDefault: true, isActive: true }
        ]
      }).sort({ organizationId: -1 }); // Prioritize org-specific over global

      if (!selectedTemplate) {
        return res.status(400).send('<h1>No template found. Please select a template or set a default template in Payslip Templates page.</h1>');
      }
    }

    console.log('Preview - Using template:', selectedTemplate.name, '(ID:', selectedTemplate._id + ')');
    templateHTML = selectedTemplate.htmlContent;

    // Extract styles and body content
    const { styles, bodyContent } = extractTemplateComponents(templateHTML);

    // Generate preview for each month - fetch actual payment data
    const monthPayslips = [];
    for (let index = 0; index < monthsArray.length; index++) {
      const monthStr = monthsArray[index];
      const [year, month] = monthStr.split('-');
      const yearInt = parseInt(year);
      const monthInt = parseInt(month);

      // Find PaymentTracking record for this month
      const startOfMonth = new Date(yearInt, monthInt - 1, 1);
      const endOfMonth = new Date(yearInt, monthInt, 0);

      const payment = await PaymentTracking.findOne({
        employeeId,
        organizationId,
        paymentDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      if (!payment) {
        return res.status(404).send(`<h1>No payment record found for ${monthStr}. Cannot preview payslip without payment data.</h1>`);
      }

      // Calculate YTD for this month
      const ytdData = await calculateYTD(employeeId, organizationId, monthStr);

      // Generate payslip data with actual payment
      const data = generatePayslipData(employee, org, payment, ytdData, monthStr);
      const filledContent = replacePlaceholders(bodyContent, data);

      monthPayslips.push(`<div style="margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; background: white;">
        <h3 style="text-align: center; margin-bottom: 20px;">Month: ${monthStr}</h3>
        ${filledContent}
      </div>`);
    }

    const monthPayslipsHTML = monthPayslips.join('\n');

    // Build preview HTML
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payslip Preview - ${employee.name}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #f5f5f5;
        }
        ${styles}
    </style>
</head>
<body>
    <h1 style="text-align: center;">Payslip Preview - ${employee.name}</h1>
    ${monthPayslipsHTML}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTML);

  } catch (error) {
    console.error('Preview payslip error:', error);
    res.status(500).send('<h1>Server Error</h1>');
  }
});

// @route   POST /api/payslips/generate-manual
// @desc    Generate payslip manually (without existing employee record) - Multi-month support
// @access  OrgAdmin
router.post('/generate-manual', protect, orgAdminOrSuperAdmin, upload.single('companyLogo'), async (req, res) => {
  try {
    const {
      companyName,
      companyEmail,
      companyAddress,
      companyPhone,
      companyLogoUrl, // Logo URL from saved profile
      bankAccountName,
      bankAccountNumber,
      bankTransitNumber,
      employeeName,
      employeeEmail,
      employeeAddress,
      employeePosition,
      province,
      payPeriodFrom,
      payPeriodTo,
      grossSalary,
      payFrequency,
      monthlyTaxData, // Array of tax calculations for each month
      templateId
    } = req.body;

    // Validate required fields
    if (!companyName || !companyAddress || !companyPhone || !employeeName || !province || !payPeriodFrom || !payPeriodTo || !grossSalary || !templateId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Parse monthly tax data if provided as string
    let parsedMonthlyTaxData = monthlyTaxData;
    if (typeof monthlyTaxData === 'string') {
      try {
        parsedMonthlyTaxData = JSON.parse(monthlyTaxData);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid monthly tax data format'
        });
      }
    }

    // Validate we have tax data for each month
    if (!parsedMonthlyTaxData || !Array.isArray(parsedMonthlyTaxData) || parsedMonthlyTaxData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Monthly tax data is required'
      });
    }

    // Get template
    const template = await PayslipTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Prepare logo - create complete img tag
    let companyLogo = '';
    if (req.file) {
      // New file uploaded
      const logoUrl = `${req.protocol}://${req.get('host')}/uploads/manual-payslips/${req.file.filename}`;
      companyLogo = `<img src="${logoUrl}" alt="Company Logo" style="max-width: 150px; max-height: 60px;" />`;
    } else if (companyLogoUrl) {
      // Use logo from saved profile
      companyLogo = `<img src="${companyLogoUrl}" alt="Company Logo" style="max-width: 150px; max-height: 60px;" />`;
    }

    // Parse dates and generate list of months
    const startDate = new Date(payPeriodFrom);
    const endDate = new Date(payPeriodTo);

    const months = [];
    let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (currentDate <= endDate) {
      months.push({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
        monthName: monthNames[currentDate.getMonth()],
        firstDay: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
        lastDay: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Helper to mask account number
    const maskAccountNumber = (number) => {
      if (!number) return '';
      const numStr = number.toString();
      if (numStr.length <= 4) return numStr;
      return '*'.repeat(numStr.length - 4) + numStr.slice(-4);
    };

    // Extract template components
    const { styles, bodyContent } = extractTemplateComponents(template.htmlContent);

    // Ensure we have tax data for each month
    if (parsedMonthlyTaxData.length !== months.length) {
      return res.status(400).json({
        success: false,
        message: `Mismatch: Expected tax data for ${months.length} months, but received ${parsedMonthlyTaxData.length}`
      });
    }

    // Generate payslip for each month
    const monthPayslips = [];
    let ytdGross = 0, ytdFederalTax = 0, ytdProvincialTax = 0, ytdCpp = 0, ytdEi = 0, ytdNet = 0, ytdTotalDeductions = 0;
    let currentYear = null;

    for (let index = 0; index < months.length; index++) {
      const monthInfo = months[index];

      // Reset YTD when year changes
      if (currentYear !== null && monthInfo.year !== currentYear) {
        console.log(`🔄 Year changed from ${currentYear} to ${monthInfo.year} - Resetting YTD values`);
        ytdGross = 0;
        ytdFederalTax = 0;
        ytdProvincialTax = 0;
        ytdCpp = 0;
        ytdEi = 0;
        ytdTotalDeductions = 0;
        ytdNet = 0;
      }
      currentYear = monthInfo.year;

      // Get pre-calculated tax data for this month
      const monthTaxes = parsedMonthlyTaxData[index];

      // Update YTD values
      const monthGross = parseFloat(grossSalary);
      const monthFederalTax = monthTaxes.tax_deductions?.federal_tax || 0;
      const monthProvincialTax = monthTaxes.tax_deductions?.provincial_tax || 0;
      const monthCpp = monthTaxes.other_deductions?.cpp || 0;
      const monthEi = monthTaxes.other_deductions?.ei || 0;
      const monthTotalDeductions = monthTaxes.totals?.total_deductions || 0;
      const monthNet = monthTaxes.totals?.net_amount || 0;

      ytdGross += monthGross;
      ytdFederalTax += monthFederalTax;
      ytdProvincialTax += monthProvincialTax;
      ytdCpp += monthCpp;
      ytdEi += monthEi;
      ytdTotalDeductions += monthTotalDeductions;
      ytdNet += monthNet;

      // Prepare template data for this month
      const templateData = {
        // Company info
        company_name: companyName,
        COMPANY_NAME: companyName,
        company_email: companyEmail || '',
        COMPANY_EMAIL: companyEmail || '',
        company_address: companyAddress,
        COMPANY_ADDRESS: companyAddress,
        COMPANY_ADDRESS_LINE1: companyAddress ? companyAddress.split('\n')[0] : '',
        COMPANY_ADDRESS_LINE2: companyAddress ? companyAddress.split('\n').slice(1).join(', ') : '',
        company_phone: companyPhone,
        COMPANY_PHONE: companyPhone,
        company_logo: companyLogo,
        COMPANY_LOGO: companyLogo,

        // Bank info
        bank_name: bankAccountName || companyName,
        BANK_NAME: bankAccountName || companyName,
        bank_account_name: bankAccountName || companyName,
        BANK_ACCOUNT_NAME: bankAccountName || companyName,
        bank_account_number: bankAccountNumber ? maskAccountNumber(bankAccountNumber) : '',
        BANK_ACCOUNT_NUMBER: bankAccountNumber ? maskAccountNumber(bankAccountNumber) : '',
        account_number: bankAccountNumber ? maskAccountNumber(bankAccountNumber) : '',
        ACCOUNT_NUMBER: bankAccountNumber ? maskAccountNumber(bankAccountNumber) : '',
        bank_transit_number: bankTransitNumber || '',
        BANK_TRANSIT_NUMBER: bankTransitNumber || '',
        bank_transit: bankTransitNumber || '',
        BANK_TRANSIT: bankTransitNumber || '',
        advice_number: `${monthInfo.year}${String(monthInfo.month).padStart(2, '0')}-${Date.now().toString().slice(-6)}`,
        ADVICE_NUMBER: `${monthInfo.year}${String(monthInfo.month).padStart(2, '0')}-${Date.now().toString().slice(-6)}`,

        // Employee info
        employee_name: employeeName,
        EMPLOYEE_NAME: employeeName,
        employee_email: employeeEmail || '',
        EMPLOYEE_EMAIL: employeeEmail || '',
        employee_address: employeeAddress || '',
        EMPLOYEE_ADDRESS: employeeAddress || '',
        EMPLOYEE_LOCATION: employeeAddress || '',
        employee_position: employeePosition || '',
        EMPLOYEE_POSITION: employeePosition || '',
        employee_province: province,
        EMPLOYEE_PROVINCE: province,

        // Pay period
        period_start: monthInfo.firstDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        PERIOD_START: monthInfo.firstDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        period_end: monthInfo.lastDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        PERIOD_END: monthInfo.lastDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        pay_date: monthInfo.lastDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        PAY_DATE: monthInfo.lastDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        payment_date: monthInfo.lastDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        PAYMENT_DATE: monthInfo.lastDay.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),

        // Earnings - this period
        gross_pay: formatCurrency(monthGross),
        GROSS_PAY: formatCurrency(monthGross),
        gross_salary: formatCurrency(monthGross),
        GROSS_SALARY: formatCurrency(monthGross),
        salary: formatCurrency(monthGross),
        SALARY: formatCurrency(monthGross),

        // Deductions - this period
        federal_tax: formatCurrency(monthFederalTax),
        FEDERAL_TAX: formatCurrency(monthFederalTax),
        provincial_tax: formatCurrency(monthProvincialTax),
        PROVINCIAL_TAX: formatCurrency(monthProvincialTax),
        total_tax: formatCurrency(monthFederalTax + monthProvincialTax),
        TOTAL_TAX: formatCurrency(monthFederalTax + monthProvincialTax),
        cpp: formatCurrency(monthCpp),
        CPP: formatCurrency(monthCpp),
        CPP_DEDUCTION: formatCurrency(monthCpp),
        cpp2: formatCurrency(monthTaxes.other_deductions?.cpp2 || 0),
        CPP2: formatCurrency(monthTaxes.other_deductions?.cpp2 || 0),
        ei: formatCurrency(monthEi),
        EI: formatCurrency(monthEi),
        EI_DEDUCTION: formatCurrency(monthEi),

        // Totals - this period
        total_deductions: formatCurrency(monthTotalDeductions),
        TOTAL_DEDUCTIONS: formatCurrency(monthTotalDeductions),
        net_pay: formatCurrency(monthNet),
        NET_PAY: formatCurrency(monthNet),
        net_amount: formatCurrency(monthNet),
        NET_AMOUNT: formatCurrency(monthNet),

        // Tax exemptions/allowances
        federal_exemption: monthTaxes.employee_info?.federal_td1 || '0',
        FEDERAL_EXEMPTION: monthTaxes.employee_info?.federal_td1 || '0',
        provincial_exemption: monthTaxes.employee_info?.provincial_td1 || '0',
        PROVINCIAL_EXEMPTION: monthTaxes.employee_info?.provincial_td1 || '0',

        // YTD values - WITHOUT dollar signs (template has $ prefix)
        ytd_gross: formatCurrency(ytdGross),
        YTD_GROSS: formatCurrency(ytdGross),
        GROSS_PAY_YTD: formatCurrency(ytdGross),
        ytd_federal_tax: formatCurrency(ytdFederalTax),
        YTD_FEDERAL_TAX: formatCurrency(ytdFederalTax),
        FEDERAL_TAX_YTD: formatCurrency(ytdFederalTax),
        ytd_provincial_tax: formatCurrency(ytdProvincialTax),
        YTD_PROVINCIAL_TAX: formatCurrency(ytdProvincialTax),
        PROVINCIAL_TAX_YTD: formatCurrency(ytdProvincialTax),
        ytd_cpp: formatCurrency(ytdCpp),
        YTD_CPP: formatCurrency(ytdCpp),
        CPP_DEDUCTION_YTD: formatCurrency(ytdCpp),
        ytd_ei: formatCurrency(ytdEi),
        YTD_EI: formatCurrency(ytdEi),
        EI_DEDUCTION_YTD: formatCurrency(ytdEi),
        ytd_total_deductions: formatCurrency(ytdTotalDeductions),
        YTD_TOTAL_DEDUCTIONS: formatCurrency(ytdTotalDeductions),
        ytd_net_pay: formatCurrency(ytdNet),
        YTD_NET_PAY: formatCurrency(ytdNet),
        NET_PAY_YTD: formatCurrency(ytdNet),

        // Vacation (set to 0 for manual generation)
        VACATION_PERIOD: '0',
        VACATION_TOTAL: '0',
        VACATION_YTD: '0',
        vacation_balance: '0',
        VACATION_BALANCE: '0',

        // Additional fields
        current_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        CURRENT_DATE: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        year: monthInfo.year,
        YEAR: monthInfo.year,
        month: monthInfo.monthName,
        MONTH: monthInfo.monthName,
      };

      // Replace placeholders for this month
      const filledContent = replacePlaceholders(bodyContent, templateData);

      // Add page break after each payslip except the last one
      const pageBreak = index < months.length - 1 ? 'page-break-after: always;' : '';
      monthPayslips.push(`<div style="${pageBreak}">${filledContent}</div>`);
    }

    const monthPayslipsHTML = monthPayslips.join('\n');

    // Build complete HTML document
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payslips - ${employeeName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        ${styles}

        @page {
            size: A4;
            margin: 0;
        }

        @media print {
            div[style*="page-break-after"] {
                page-break-after: always;
            }
        }
    </style>
</head>
<body>
    ${monthPayslipsHTML}
</body>
</html>`;

    // Generate PDF
    let browser;
    let pdfFileName;
    try {
      console.log(`📄 Generating PDF for ${months.length} month(s)...`);

      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ],
        protocolTimeout: 180000
      });

      const page = await browser.newPage();

      // Set a reasonable page size limit
      await page.setDefaultNavigationTimeout(60000);
      await page.emulateMediaType('print');

      // Use domcontentloaded for faster rendering
      await page.setContent(fullHTML, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Create output directory
      const outputDir = 'uploads/manual-payslips/pdfs';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      pdfFileName = `payslip-${employeeName.replace(/\s+/g, '_')}-${Date.now()}.pdf`;
      const pdfPath = path.join(outputDir, pdfFileName);

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false,
        timeout: 60000
      });

      console.log(`✓ PDF generated successfully: ${pdfFileName}`);
      await browser.close();
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      if (browser) {
        await browser.close().catch(e => console.error('Error closing browser:', e));
      }
      throw new Error(`PDF generation failed: ${pdfError.message}`);
    }

    const pdfUrl = `${req.protocol}://${req.get('host')}/uploads/manual-payslips/pdfs/${pdfFileName}`;

    // Save manual payslip record to database (save summary for all months)
    const manualPayslip = await ManualPayslip.create({
      organizationId: req.user.organizationId,
      companyName,
      companyEmail: companyEmail || '',
      companyAddress,
      companyPhone,
      companyLogo: req.file ? `${req.protocol}://${req.get('host')}/uploads/manual-payslips/${req.file.filename}` : '',
      bankAccountName: bankAccountName || '',
      bankAccountNumber: bankAccountNumber || '',
      bankTransitNumber: bankTransitNumber || '',
      employeeName,
      employeeEmail: employeeEmail || '',
      employeeAddress: employeeAddress || '',
      employeePosition: employeePosition || '',
      province,
      payPeriodFrom: startDate,
      payPeriodTo: endDate,
      payFrequency: payFrequency || 'MONTHLY_12PP',
      grossSalary: parseFloat(grossSalary),
      federalTax: ytdFederalTax,
      provincialTax: ytdProvincialTax,
      totalTax: ytdFederalTax + ytdProvincialTax,
      cpp: ytdCpp,
      cpp2: 0,
      ei: ytdEi,
      totalDeductions: ytdTotalDeductions,
      netPay: ytdNet,
      templateId,
      templateName: template.name,
      pdfUrl,
      generatedBy: req.user._id,
      status: 'generated'
    });

    res.json({
      success: true,
      message: `Payslip generated successfully for ${months.length} month(s)`,
      payslip: {
        _id: manualPayslip._id,
        employeeName,
        companyName,
        monthsGenerated: months.length,
        payPeriodFrom: startDate,
        payPeriodTo: endDate,
        totalGrossPay: ytdGross,
        totalNetPay: ytdNet,
        pdfUrl,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Manual payslip generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payslip',
      error: error.message
    });
  }
});

// @route   GET /api/payslips/manual-recent/:organizationId
// @desc    Get recent manual payslips
// @access  OrgAdmin
router.get('/manual-recent/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const manualPayslips = await ManualPayslip.find({ organizationId })
      .populate('generatedBy', 'email')
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      payslips: manualPayslips
    });

  } catch (error) {
    console.error('Get manual payslips error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch manual payslips',
      error: error.message
    });
  }
});

export default router;
