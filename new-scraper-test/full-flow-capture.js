/**
 * Complete Flow Capture - CRA Payroll Calculator
 *
 * This script completes the entire calculation flow and captures
 * the exact API endpoint and payload used for calculations.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

const calculationRequests = [];
let calculationResponse = null;

async function captureCompleteFlow() {
  console.log('🚀 Starting Complete Flow Capture\n');
  console.log('='.repeat(80));

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 500, // Slow down so we can see what's happening
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ===== INTERCEPT NETWORK =====
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      // Log all POST requests
      if (request.method() === 'POST') {
        const info = {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        };

        console.log(`\n📤 POST ${request.url()}`);
        if (request.postData()) {
          console.log(`   Data: ${request.postData()}`);
        }

        calculationRequests.push(info);
      }

      request.continue();
    });

    page.on('response', async (response) => {
      // Capture responses to POST requests
      if (response.request().method() === 'POST') {
        try {
          const url = response.url();
          const status = response.status();

          // Skip analytics
          if (!url.includes('omtrdc.net') && !url.includes('noop')) {
            const contentType = response.headers()['content-type'] || '';

            if (contentType.includes('json') || contentType.includes('text')) {
              const body = await response.text();

              console.log(`\n📥 ${status} ${url}`);
              console.log(`   Response: ${body.substring(0, 500)}`);

              // Check if this looks like a calculation response
              if (url.includes('calculator') ||
                  url.includes('calculate') ||
                  url.includes('payroll') ||
                  url.includes('deduction')) {
                calculationResponse = {
                  url,
                  status,
                  headers: response.headers(),
                  body
                };
                console.log('\n✅ FOUND CALCULATION RESPONSE!');
              }
            }
          }
        } catch (e) {
          // Some responses can't be read
        }
      }
    });

    // ===== STEP 1: Load Page =====
    console.log('\n\n📍 STEP 1: Loading initial page...\n');
    await page.goto('https://apps.cra-arc.gc.ca/ebci/rhpd/beta/step1', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    console.log('   ✓ Page loaded');

    // Take screenshot
    await page.screenshot({ path: 'step1-loaded.png', fullPage: true });

    // ===== STEP 2: Click "Next" to get to salary selection =====
    console.log('\n📍 STEP 2: Clicking "Next" button...\n');

    try {
      // Try multiple selectors for the Next button
      const nextButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        return buttons.find(btn =>
          btn.textContent?.includes('Next') ||
          btn.textContent?.includes('Suivant') ||
          btn.value?.includes('Next')
        );
      });

      if (nextButton.asElement()) {
        await nextButton.asElement().click();
        await page.waitForTimeout(3000);
        console.log('   ✓ Clicked Next');
      }
    } catch (e) {
      console.log('   ⚠️  Could not find Next button, trying to proceed...');
    }

    await page.screenshot({ path: 'step2-after-next.png', fullPage: true });

    // ===== STEP 3: Select "Salary" option =====
    console.log('\n📍 STEP 3: Selecting "Salary" option...\n');

    try {
      const salaryButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        return buttons.find(btn =>
          btn.textContent?.toLowerCase().includes('salary') ||
          btn.textContent?.toLowerCase().includes('salaire')
        );
      });

      if (salaryButton.asElement()) {
        await salaryButton.asElement().click();
        await page.waitForTimeout(3000);
        console.log('   ✓ Selected Salary option');
      } else {
        console.log('   ⚠️  Salary button not found, checking current page...');
      }
    } catch (e) {
      console.log(`   ⚠️  Error selecting salary: ${e.message}`);
    }

    await page.screenshot({ path: 'step3-salary-selected.png', fullPage: true });

    // ===== STEP 4: Fill form fields =====
    console.log('\n📍 STEP 4: Filling form fields...\n');

    // Try to find and fill province
    try {
      const provinceSelectors = [
        'select[name*="province" i]',
        'select[id*="province" i]',
        'select[name*="prov" i]',
        '#province',
        'select'
      ];

      let provinceFilled = false;
      for (const selector of provinceSelectors) {
        try {
          const provinceField = await page.$(selector);
          if (provinceField) {
            // Get all options to see what values are available
            const options = await page.evaluate((el) => {
              return Array.from(el.options).map(opt => ({
                value: opt.value,
                text: opt.text
              }));
            }, provinceField);

            console.log('   Found province selector with options:', options.slice(0, 5));

            // Try to select Ontario
            const ontarioOption = options.find(opt =>
              opt.text?.includes('Ontario') ||
              opt.value === 'ON' ||
              opt.value === 'on'
            );

            if (ontarioOption) {
              await page.select(selector, ontarioOption.value);
              console.log(`   ✓ Selected province: ${ontarioOption.text}`);
              provinceFilled = true;
              await page.waitForTimeout(1000);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (!provinceFilled) {
        console.log('   ⚠️  Could not fill province field');
      }
    } catch (e) {
      console.log(`   ⚠️  Error filling province: ${e.message}`);
    }

    // Try to find and fill salary
    try {
      const salarySelectors = [
        'input[name*="salary" i]',
        'input[id*="salary" i]',
        'input[name*="amount" i]',
        'input[type="number"]',
        'input[type="text"]'
      ];

      let salaryFilled = false;
      for (const selector of salarySelectors) {
        try {
          const salaryField = await page.$(selector);
          if (salaryField) {
            const fieldName = await page.evaluate(el => el.name || el.id, salaryField);
            console.log(`   Found input field: ${fieldName}`);

            // Clear and type
            await salaryField.click({ clickCount: 3 });
            await salaryField.type('5000');
            console.log('   ✓ Entered salary: 5000');
            salaryFilled = true;
            await page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!salaryFilled) {
        console.log('   ⚠️  Could not fill salary field');
      }
    } catch (e) {
      console.log(`   ⚠️  Error filling salary: ${e.message}`);
    }

    // Try to find and fill payment date
    try {
      const dateFields = await page.$$('select');
      console.log(`   Found ${dateFields.length} select fields (checking for date fields)...`);

      for (let i = 0; i < Math.min(dateFields.length, 10); i++) {
        const field = dateFields[i];
        const fieldInfo = await page.evaluate(el => ({
          name: el.name,
          id: el.id,
          options: Array.from(el.options).slice(0, 5).map(o => o.text)
        }), field);

        console.log(`   Field ${i}: ${fieldInfo.name || fieldInfo.id}`, fieldInfo.options);

        // If it looks like a year field
        if (fieldInfo.options.some(opt => opt?.match(/20\d{2}/))) {
          await field.select('2025');
          console.log('   ✓ Selected year: 2025');
        }

        // If it looks like a month field
        if (fieldInfo.options.some(opt => opt?.toLowerCase().includes('jan') || opt?.toLowerCase().includes('dec'))) {
          await field.select(fieldInfo.options[1]); // Select first real month
          console.log('   ✓ Selected month');
        }

        // If it looks like a day field
        if (fieldInfo.options.some(opt => opt?.match(/^\d{1,2}$/))) {
          await field.select('15');
          console.log('   ✓ Selected day: 15');
        }
      }
    } catch (e) {
      console.log(`   ⚠️  Error filling date: ${e.message}`);
    }

    await page.screenshot({ path: 'step4-form-filled.png', fullPage: true });

    // ===== STEP 5: Click Calculate =====
    console.log('\n📍 STEP 5: Clicking Calculate button...\n');

    try {
      const calculateButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        return buttons.find(btn =>
          btn.textContent?.toLowerCase().includes('calculate') ||
          btn.textContent?.toLowerCase().includes('calculer') ||
          btn.textContent?.toLowerCase().includes('next') ||
          btn.textContent?.toLowerCase().includes('suivant') ||
          btn.value?.toLowerCase().includes('calculate') ||
          btn.value?.toLowerCase().includes('next')
        );
      });

      if (calculateButton.asElement()) {
        console.log('   ✓ Found calculate/next button, clicking...');
        await calculateButton.asElement().click();
        await page.waitForTimeout(5000); // Wait for calculation
        console.log('   ✓ Clicked, waiting for response...');
      } else {
        console.log('   ⚠️  Calculate button not found');
      }
    } catch (e) {
      console.log(`   ⚠️  Error clicking calculate: ${e.message}`);
    }

    await page.screenshot({ path: 'step5-after-calculate.png', fullPage: true });

    // ===== STEP 6: Extract Results =====
    console.log('\n📍 STEP 6: Extracting results from page...\n');

    const resultsText = await page.evaluate(() => {
      return document.body.innerText;
    });

    // Look for dollar amounts
    const amounts = resultsText.match(/\$[\d,]+\.?\d*/g);
    if (amounts) {
      console.log('   💰 Amounts found on page:', amounts.slice(0, 10));
    }

    // ===== SAVE RESULTS =====
    console.log('\n\n📊 SAVING RESULTS\n');
    console.log('='.repeat(80));

    const report = {
      timestamp: new Date().toISOString(),
      calculationRequests,
      calculationResponse,
      screenshots: [
        'step1-loaded.png',
        'step2-after-next.png',
        'step3-salary-selected.png',
        'step4-form-filled.png',
        'step5-after-calculate.png'
      ],
      amounts
    };

    fs.writeFileSync(
      'calculation-capture.json',
      JSON.stringify(report, null, 2)
    );

    console.log('✅ Saved: calculation-capture.json');

    // Generate summary
    let summary = '# CRA API Calculation Endpoint Discovery\n\n';
    summary += `Date: ${new Date().toISOString()}\n\n`;

    summary += '## Calculation Requests Found\n\n';
    if (calculationRequests.length > 0) {
      calculationRequests.forEach((req, idx) => {
        summary += `### Request ${idx + 1}\n\n`;
        summary += `**URL:** \`${req.url}\`\n\n`;
        summary += `**Method:** ${req.method}\n\n`;
        summary += '**Headers:**\n```json\n' + JSON.stringify(req.headers, null, 2) + '\n```\n\n';
        if (req.postData) {
          summary += '**POST Data:**\n```json\n' + req.postData + '\n```\n\n';
        }
      });
    } else {
      summary += 'No calculation requests captured. The form may not have been submitted successfully.\n\n';
    }

    summary += '## Calculation Response\n\n';
    if (calculationResponse) {
      summary += `**URL:** \`${calculationResponse.url}\`\n\n`;
      summary += `**Status:** ${calculationResponse.status}\n\n`;
      summary += '**Body:**\n```json\n' + calculationResponse.body + '\n```\n\n';
    } else {
      summary += 'No calculation response captured.\n\n';
    }

    summary += '## Next Steps\n\n';
    summary += '1. Review the captured requests above\n';
    summary += '2. Identify the calculation endpoint URL\n';
    summary += '3. Understand the request payload structure\n';
    summary += '4. Implement direct API client using this information\n';
    summary += '5. Test with various provinces and salary amounts\n';

    fs.writeFileSync('API-ENDPOINT-REPORT.md', summary);
    console.log('✅ Saved: API-ENDPOINT-REPORT.md');

    console.log('\n\n✅ Flow capture complete!');
    console.log('\nCheck the following files:');
    console.log('  - calculation-capture.json (detailed capture)');
    console.log('  - API-ENDPOINT-REPORT.md (human-readable summary)');
    console.log('  - step*.png (screenshots of each step)\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    // Keep browser open for manual inspection
    console.log('\n⏸️  Browser left open for manual inspection.');
    console.log('   Close the browser window when done.\n');
    // await browser.close();
  }
}

// Run
captureCompleteFlow().catch(console.error);
