import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to format currency (without $ sign as template has it)
const formatCurrency = (amount) => {
  if (typeof amount !== 'number') return '0.00';
  return amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
};

// Helper to get month name
const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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

// Replace placeholders in template
const replacePlaceholders = (htmlTemplate, data) => {
  let html = htmlTemplate;

  // Replace all placeholders
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    html = html.replace(regex, data[key] || '');
  });

  return html;
};

// Generate payslip data for replacement
const generatePayslipData = (monthStr) => {
  const [year, month] = monthStr.split('-');
  const monthInt = parseInt(month);
  const monthName = monthNames[monthInt - 1];

  // Mock salary data
  const salary = {
    gross: 5000,
    fTax: 500,
    tax: 700,
    ei: 80,
    cpp: 250,
    net: 3470
  };

  // Calculate YTD
  const ytdMultiplier = monthInt;

  // Mock organization data
  const org = {
    name: 'Sparklex Technologies',
    email: 'info@sparklextechnologies.com',
    phone: '+1-234-567-8900',
    logo: '' // Empty for now
  };

  // Mock employee data
  const employee = {
    name: 'John Doe',
    email: 'john.doe@example.com'
  };

  // Prepare data for placeholder replacement
  return {
    // Company/Organization
    company_logo: org.logo ? `<img src="${org.logo}" alt="Logo" class="company-logo">` : '',
    company_name: org.name,
    company_address: org.email,
    company_phone: org.phone || '',

    // Employee
    employee_name: employee.name,
    employee_email: employee.email || '',
    employee_address: employee.email || '',

    // Period information
    period_start: `${monthName} 01, ${year}`,
    period_end: `${monthName} 28, ${year}`,
    pay_date: `${monthName} 28, ${year}`,
    generated_date: new Date().toLocaleDateString(),

    // Earnings
    hourly_rate: formatCurrency(salary.gross / 160),
    hours_worked: '160',
    gross_pay: formatCurrency(salary.gross),
    year_to_date_gross: formatCurrency(salary.gross * ytdMultiplier),

    // Deductions
    federal_tax: formatCurrency(salary.fTax),
    year_to_date_federal_tax: formatCurrency(salary.fTax * ytdMultiplier),
    provincial_tax: formatCurrency(salary.tax - salary.fTax),
    year_to_date_provincial_tax: formatCurrency((salary.tax - salary.fTax) * ytdMultiplier),
    ei_deduction: formatCurrency(salary.ei),
    year_to_date_ei: formatCurrency(salary.ei * ytdMultiplier),
    cpp_deduction: formatCurrency(salary.cpp),
    year_to_date_cpp: formatCurrency(salary.cpp * ytdMultiplier),

    // Summary
    net_pay: formatCurrency(salary.net),
    year_to_date_net: formatCurrency(salary.net * ytdMultiplier),

    // Additional
    vacation_accrual: formatCurrency(salary.gross * 0.04),
    vacation_balance: formatCurrency(salary.gross * 0.08),
  };
};

async function testPayslipGeneration() {
  console.log('='.repeat(60));
  console.log('PAYSLIP PDF GENERATION TEST');
  console.log('='.repeat(60));

  try {
    // Step 1: Read template
    console.log('\n1. Reading template2.html...');
    const templatePath = path.join(__dirname, 'templates', 'template2.html');
    const templateHTML = await fs.readFile(templatePath, 'utf-8');
    console.log(`   ✓ Template read successfully (${templateHTML.length} characters)`);

    // Step 2: Extract components
    console.log('\n2. Extracting template components...');
    const { styles, bodyContent } = extractTemplateComponents(templateHTML);
    console.log(`   ✓ Styles extracted: ${styles.length} characters`);
    console.log(`   ✓ Body content extracted: ${bodyContent.length} characters`);

    // Step 3: Generate test data
    console.log('\n3. Generating test payslip data...');
    const months = ['2025-01', '2025-02'];
    console.log(`   ✓ Testing with months: ${months.join(', ')}`);

    // Step 4: Create payslip HTML for each month
    console.log('\n4. Creating payslip HTML for each month...');
    const monthPayslips = months.map((monthStr, index) => {
      const data = generatePayslipData(monthStr);
      const filledContent = replacePlaceholders(bodyContent, data);

      // Add page break after each payslip except the last one
      const pageBreak = index < months.length - 1 ? 'page-break-after: always;' : '';
      return `<div style="${pageBreak}">${filledContent}</div>`;
    }).join('\n');
    console.log(`   ✓ Generated HTML for ${months.length} months`);

    // Step 5: Build complete HTML document
    console.log('\n5. Building complete HTML document...');
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payslips - Test</title>
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
    ${monthPayslips}
</body>
</html>`;
    console.log(`   ✓ Full HTML document created (${fullHTML.length} characters)`);

    // Step 6: Save HTML for inspection
    console.log('\n6. Saving HTML for inspection...');
    const htmlOutputPath = path.join(__dirname, 'test-payslip.html');
    await fs.writeFile(htmlOutputPath, fullHTML, 'utf-8');
    console.log(`   ✓ HTML saved to: ${htmlOutputPath}`);

    // Step 7: Generate PDF using Puppeteer
    console.log('\n7. Generating PDF with Puppeteer...');
    console.log('   - Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    console.log('   - Browser launched');

    // Emulate print media for @media print styles
    console.log('   - Emulating print media type...');
    await page.emulateMediaType('print');

    console.log('   - Setting HTML content...');
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

    console.log('   - Generating PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    await browser.close();
    console.log(`   ✓ PDF generated (${pdfBuffer.length} bytes = ${(pdfBuffer.length / 1024).toFixed(2)} KB)`);

    // Step 8: Save PDF
    console.log('\n8. Saving PDF...');
    const pdfOutputPath = path.join(__dirname, 'test-payslip.pdf');
    await fs.writeFile(pdfOutputPath, pdfBuffer);
    console.log(`   ✓ PDF saved to: ${pdfOutputPath}`);

    // Step 9: Validate PDF
    console.log('\n9. Validating PDF...');
    const pdfContent = await fs.readFile(pdfOutputPath);

    // Check PDF header
    const pdfHeader = pdfContent.toString('ascii', 0, 8);
    if (pdfHeader.startsWith('%PDF-')) {
      console.log(`   ✓ Valid PDF header: ${pdfHeader.trim()}`);
    } else {
      console.log(`   ✗ INVALID PDF header: ${pdfHeader}`);
      throw new Error('Invalid PDF header');
    }

    // Check PDF trailer
    const pdfEnd = pdfContent.toString('ascii', pdfContent.length - 6);
    if (pdfEnd.includes('%%EOF')) {
      console.log('   ✓ Valid PDF trailer (%%EOF found)');
    } else {
      console.log('   ✗ WARNING: PDF trailer might be corrupted');
    }

    // Check file size
    if (pdfContent.length > 0 && pdfContent.length < 10 * 1024 * 1024) {
      console.log(`   ✓ PDF size is reasonable: ${(pdfContent.length / 1024).toFixed(2)} KB`);
    } else if (pdfContent.length >= 10 * 1024 * 1024) {
      console.log(`   ✗ WARNING: PDF is very large: ${(pdfContent.length / 1024 / 1024).toFixed(2)} MB`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\nOutput files:');
    console.log(`  HTML: ${htmlOutputPath}`);
    console.log(`  PDF:  ${pdfOutputPath}`);
    console.log('\nYou can open the PDF file to verify it displays correctly.');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('TEST FAILED!');
    console.error('='.repeat(60));
    console.error('\nError details:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testPayslipGeneration();
