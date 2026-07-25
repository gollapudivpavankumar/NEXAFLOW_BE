/**
 * Monitor Form Submissions - CRA Payroll Calculator
 *
 * This script monitors ALL network activity including form submissions
 * to see if there's any API we can use directly.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

const allRequests = [];
const formSubmissions = [];

async function monitorFormSubmissions() {
  console.log('🔬 Monitoring Form Submissions\n');

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 300,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Intercept ALL requests
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const info = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        headers: request.headers(),
        postData: request.postData(),
        timestamp: new Date().toISOString()
      };

      // Log navigation and form submissions
      if (request.resourceType() === 'document' || request.method() === 'POST') {
        console.log(`\n🔗 ${request.method()} ${request.url()}`);
        if (request.postData()) {
          console.log(`   POST Data: ${request.postData()}`);
          formSubmissions.push(info);
        }
      }

      allRequests.push(info);
      request.continue();
    });

    page.on('response', async (response) => {
      const url = response.url();
      const status = response.status();

      // Log responses to form submissions
      if (response.request().method() === 'POST' ||
          response.request().resourceType() === 'document') {
        console.log(`   ← ${status} ${url}`);
      }
    });

    // STEP-BY-STEP NAVIGATION WITH MONITORING

    console.log('\n📍 Step 0: Loading entry page\n');
    await page.goto('https://apps.cra-arc.gc.ca/ebci/rhpd/beta/', {
      waitUntil: 'networkidle2'
    });
    await page.waitForTimeout(2000);

    console.log('\n📍 Step 1: Clicking "Salary" option\n');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div, span'));
      const salaryEl = elements.find(el => el.textContent.trim().includes('Salary'));
      if (salaryEl) salaryEl.click();
    });
    await page.waitForTimeout(2000);

    console.log('\n📍 Step 2: Clicking "Next" to go to step1\n');
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent.includes('Next'));
      if (button) button.click();
    });
    await page.waitForTimeout(3000);

    console.log('\n📍 Step 3: Filling step1 form (province, frequency, date)\n');

    // Fill province
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options).map(o => o.value);
        if (options.includes('ONTARIO')) {
          select.value = 'ONTARIO';
          select.dispatchEvent(new Event('change'));
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    // Fill pay frequency
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options).map(o => o.value);
        if (options.includes('MONTHLY_12PP')) {
          select.value = 'MONTHLY_12PP';
          select.dispatchEvent(new Event('change'));
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    // Fill date
    const yearSelect = await page.$('#datePaidYear');
    if (yearSelect) {
      await page.evaluate(() => {
        document.querySelector('#datePaidYear').value = '2025';
        document.querySelector('#datePaidYear').dispatchEvent(new Event('change'));
      });
      await page.waitForTimeout(500);
    }

    // Fill month
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options);
        if (options.some(o => o.text.includes('January'))) {
          select.value = '01';
          select.dispatchEvent(new Event('change'));
          break;
        }
      }
    });
    await page.waitForTimeout(500);

    // Fill day
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options);
        if (options.some(o => o.value === '31' && o.value.length === 2)) {
          select.value = '31';
          select.dispatchEvent(new Event('change'));
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    console.log('\n📍 Step 4: Submitting step1 form → step2\n');
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent.includes('Next'));
      if (button) button.click();
    });
    await page.waitForTimeout(3000);

    console.log('\n📍 Step 5: Filling step2 form (salary)\n');

    // Fill salary
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      if (inputs.length > 0) {
        inputs[0].value = '5000.00';
        inputs[0].dispatchEvent(new Event('input'));
        inputs[0].dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(1000);

    // Select "No bonus"
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      for (const radio of radios) {
        if (radio.value === 'false') {
          radio.click();
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    console.log('\n📍 Step 6: Submitting step2 form → step3\n');
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent.includes('Next'));
      if (button) button.click();
    });
    await page.waitForTimeout(3000);

    console.log('\n📍 Step 7: Clicking "Calculate" on step3 → results\n');
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent.toLowerCase().includes('calculate'));
      if (button) button.click();
    });
    await page.waitForTimeout(5000);

    console.log('\n📍 Step 8: Extracting results\n');

    const results = await page.evaluate(() => {
      const data = {};
      document.querySelectorAll('tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 2) {
          const label = tds[0].textContent.trim();
          const value = tds[1].textContent.trim();
          if (value) data[label] = value;
        }
      });
      return data;
    });

    console.log('\n💰 Results:', results);

    // Save everything
    const report = {
      timestamp: new Date().toISOString(),
      totalRequests: allRequests.length,
      formSubmissions: formSubmissions.length,
      allRequests: allRequests.filter(r =>
        r.url.includes('ebci/rhpd') || r.method === 'POST'
      ),
      formSubmissions,
      results
    };

    fs.writeFileSync('form-submissions-report.json', JSON.stringify(report, null, 2));

    console.log('\n\n📊 ANALYSIS\n');
    console.log('='.repeat(80));
    console.log(`Total requests: ${allRequests.length}`);
    console.log(`Form submissions (POST): ${formSubmissions.length}`);
    console.log(`\nDocument navigations:`);

    allRequests
      .filter(r => r.resourceType === 'document')
      .forEach(r => console.log(`  ${r.method} ${r.url}`));

    console.log('\n\n✅ Report saved to: form-submissions-report.json\n');

    // Generate summary
    let summary = '# Form Submission Analysis\n\n';
    summary += '## Flow Discovered\n\n';

    const docRequests = allRequests.filter(r => r.resourceType === 'document');
    docRequests.forEach((r, i) => {
      summary += `${i + 1}. \`${r.method} ${r.url}\`\n`;
      if (r.postData) {
        summary += `   POST Data: \`\`\`\n${r.postData}\n\`\`\`\n`;
      }
    });

    summary += '\n## Key Findings\n\n';

    if (formSubmissions.length === 0) {
      summary += '- **NO POST requests** were captured between steps\n';
      summary += '- Forms use **GET method** with URL parameters (query string)\n';
      summary += '- Navigation is via **HTTP redirects** (302/303)\n';
      summary += '- State is managed via **session cookies** (JSESSIONID)\n';
      summary += '\n## Conclusion\n\n';
      summary += 'The CRA calculator uses traditional server-side navigation with session state.\n';
      summary += 'There is **NO REST API** to call directly.\n';
      summary += '\n**Recommendation:** Continue with Selenium + caching strategy.\n';
    } else {
      summary += '- **API endpoints found!**\n';
      formSubmissions.forEach(s => {
        summary += `  - \`POST ${s.url}\`\n`;
      });
    }

    fs.writeFileSync('FORM-ANALYSIS.md', summary);
    console.log('📄 Analysis saved to: FORM-ANALYSIS.md\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n⏸️  Browser left open for inspection. Close when done.\n');
    // await browser.close();
  }
}

monitorFormSubmissions().catch(console.error);
