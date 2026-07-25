/**
 * CRA Payroll Calculator API Investigation Script
 *
 * This script intercepts network requests to reverse-engineer the API
 * used by https://apps.cra-arc.gc.ca/ebci/rhpd/beta/
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

// Store all intercepted requests
const networkLog = {
  requests: [],
  responses: [],
  formData: {},
  cookies: [],
  localStorage: {},
  sessionInfo: {}
};

async function investigateCRAAPI() {
  console.log('🔍 Starting CRA API Investigation...\n');

  const browser = await puppeteer.launch({
    headless: false, // Set to false to see what's happening
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ===== INTERCEPT ALL NETWORK REQUESTS =====
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const requestInfo = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString()
      };

      networkLog.requests.push(requestInfo);

      // Log important requests
      if (request.method() === 'POST' || request.url().includes('api') || request.url().includes('calculate')) {
        console.log(`📤 ${request.method()} ${request.url()}`);
        if (request.postData()) {
          console.log(`   Data: ${request.postData().substring(0, 200)}`);
        }
      }

      request.continue();
    });

    page.on('response', async (response) => {
      const responseInfo = {
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      };

      // Try to get response body for API calls
      if (
        response.url().includes('api') ||
        response.url().includes('calculate') ||
        response.url().includes('step') ||
        response.request().method() === 'POST'
      ) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('json') || contentType.includes('text')) {
            const body = await response.text();
            responseInfo.body = body;
            console.log(`📥 ${response.status()} ${response.url()}`);
            console.log(`   Response: ${body.substring(0, 200)}`);
          }
        } catch (e) {
          // Some responses can't be read
        }
      }

      networkLog.responses.push(responseInfo);
    });

    // ===== NAVIGATE TO PAGE =====
    console.log('\n🌐 Loading initial page...\n');
    await page.goto('https://apps.cra-arc.gc.ca/ebci/rhpd/beta/step1', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for page to fully load
    await page.waitForTimeout(3000);

    // ===== EXTRACT PAGE INFORMATION =====
    console.log('\n📋 Extracting page information...\n');

    // Get cookies
    networkLog.cookies = await page.cookies();
    console.log('🍪 Cookies found:', networkLog.cookies.length);
    networkLog.cookies.forEach(cookie => {
      console.log(`   - ${cookie.name}: ${cookie.value.substring(0, 50)}...`);
    });

    // Get localStorage
    networkLog.localStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        items[key] = localStorage.getItem(key);
      }
      return items;
    });
    console.log('\n💾 LocalStorage:', Object.keys(networkLog.localStorage));

    // Get all forms and inputs
    const formInfo = await page.evaluate(() => {
      const forms = [];
      document.querySelectorAll('form').forEach(form => {
        const formData = {
          action: form.action,
          method: form.method,
          id: form.id,
          inputs: []
        };

        form.querySelectorAll('input, select, textarea').forEach(input => {
          formData.inputs.push({
            type: input.type,
            name: input.name,
            id: input.id,
            value: input.value,
            placeholder: input.placeholder
          });
        });

        forms.push(formData);
      });
      return forms;
    });

    console.log('\n📝 Forms found:', formInfo.length);
    formInfo.forEach((form, idx) => {
      console.log(`\n   Form ${idx + 1}:`);
      console.log(`   - Action: ${form.action}`);
      console.log(`   - Method: ${form.method}`);
      console.log(`   - Inputs: ${form.inputs.length}`);
      form.inputs.forEach(input => {
        if (input.type === 'hidden' || input.name?.toLowerCase().includes('csrf') || input.name?.toLowerCase().includes('token')) {
          console.log(`     ⚠️  ${input.type} - ${input.name}: ${input.value}`);
        }
      });
    });
    networkLog.formData = formInfo;

    // Get all buttons
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input[type="submit"]')).map(btn => ({
        text: btn.textContent || btn.value,
        id: btn.id,
        class: btn.className,
        type: btn.type
      }));
    });
    console.log('\n🔘 Buttons found:', buttons.length);
    buttons.forEach(btn => console.log(`   - ${btn.text} (${btn.type})`));

    // ===== INTERACT WITH FORM =====
    console.log('\n\n🎯 Attempting to interact with form...\n');

    // Look for "Salary" button
    const salaryButton = await page.$('button:has-text("Salary"), button:has-text("Salaire")');
    if (salaryButton) {
      console.log('✅ Found Salary button, clicking...');
      await salaryButton.click();
      await page.waitForTimeout(2000);
    } else {
      // Try finding by text content
      const allButtons = await page.$$('button');
      for (const button of allButtons) {
        const text = await page.evaluate(el => el.textContent, button);
        if (text.includes('Salary') || text.includes('Salaire')) {
          console.log('✅ Found Salary button via text search, clicking...');
          await button.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    }

    // ===== TRY TO FIND AND FILL FORM =====
    console.log('\n📝 Looking for input fields to fill...\n');

    // Try to fill province
    const provinceSelect = await page.$('select[name*="province"], select[id*="province"], select[name*="Province"]');
    if (provinceSelect) {
      console.log('✅ Found province selector, selecting Ontario...');
      await provinceSelect.select('ON');
      await page.waitForTimeout(1000);
    }

    // Try to fill salary
    const salaryInput = await page.$('input[name*="salary"], input[id*="salary"], input[type="number"]');
    if (salaryInput) {
      console.log('✅ Found salary input, entering 5000...');
      await salaryInput.type('5000');
      await page.waitForTimeout(1000);
    }

    // Try to click calculate/submit
    const calculateButtons = await page.$$('button');
    for (const button of calculateButtons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text.includes('Calculate') || text.includes('Calculer') || text.includes('Next') || text.includes('Suivant')) {
        console.log(`✅ Found button: "${text}", clicking...`);
        await button.click();
        await page.waitForTimeout(3000);
        break;
      }
    }

    // ===== TAKE SCREENSHOTS =====
    console.log('\n📸 Taking screenshots...\n');
    await page.screenshot({ path: 'new-scraper-test/screenshot-step1.png', fullPage: true });
    console.log('   Saved: screenshot-step1.png');

    // Get final page HTML
    const finalHTML = await page.content();
    fs.writeFileSync('new-scraper-test/final-page.html', finalHTML);
    console.log('   Saved: final-page.html');

    // ===== ANALYZE NETWORK REQUESTS =====
    console.log('\n\n📊 NETWORK ANALYSIS\n');
    console.log('='.repeat(80));

    // Filter interesting requests
    const apiRequests = networkLog.requests.filter(r =>
      r.method === 'POST' ||
      r.url.includes('api') ||
      r.url.includes('calculate') ||
      r.url.includes('step')
    );

    console.log(`\n🎯 Found ${apiRequests.length} potentially interesting requests:\n`);

    apiRequests.forEach((req, idx) => {
      console.log(`${idx + 1}. ${req.method} ${req.url}`);
      console.log(`   Time: ${req.timestamp}`);
      if (req.postData) {
        console.log(`   POST Data:\n   ${req.postData}`);
      }
      if (req.headers) {
        const importantHeaders = ['content-type', 'authorization', 'x-csrf-token', 'x-requested-with'];
        importantHeaders.forEach(header => {
          if (req.headers[header]) {
            console.log(`   ${header}: ${req.headers[header]}`);
          }
        });
      }
      console.log('');
    });

    // ===== EXTRACT SESSION/CSRF INFO =====
    console.log('\n🔐 SESSION & SECURITY INFO\n');
    console.log('='.repeat(80));

    const csrfTokens = await page.evaluate(() => {
      const tokens = {};

      // Check meta tags
      document.querySelectorAll('meta[name*="csrf"], meta[name*="token"]').forEach(meta => {
        tokens[meta.name] = meta.content;
      });

      // Check hidden inputs
      document.querySelectorAll('input[type="hidden"]').forEach(input => {
        if (input.name?.toLowerCase().includes('csrf') ||
            input.name?.toLowerCase().includes('token') ||
            input.name?.toLowerCase().includes('viewstate')) {
          tokens[input.name] = input.value;
        }
      });

      // Check window variables
      if (window.csrfToken) tokens.window_csrfToken = window.csrfToken;
      if (window._csrf) tokens.window_csrf = window._csrf;

      return tokens;
    });

    console.log('CSRF/Security Tokens found:', Object.keys(csrfTokens).length);
    Object.entries(csrfTokens).forEach(([key, value]) => {
      console.log(`   ${key}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
    });
    networkLog.sessionInfo.csrfTokens = csrfTokens;

    // ===== SAVE COMPLETE LOG =====
    fs.writeFileSync(
      'new-scraper-test/network-log.json',
      JSON.stringify(networkLog, null, 2)
    );
    console.log('\n\n💾 Complete network log saved to: network-log.json');

    // ===== GENERATE API SUMMARY =====
    const summary = generateAPISummary(networkLog);
    fs.writeFileSync('new-scraper-test/API-SUMMARY.md', summary);
    console.log('📄 API Summary saved to: API-SUMMARY.md');

    console.log('\n\n✅ Investigation complete! Check the generated files.\n');

  } catch (error) {
    console.error('❌ Error during investigation:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

function generateAPISummary(log) {
  let md = '# CRA Payroll Calculator API Analysis\n\n';
  md += `Investigation Date: ${new Date().toISOString()}\n\n`;

  md += '## Summary\n\n';
  md += `- Total Requests: ${log.requests.length}\n`;
  md += `- POST Requests: ${log.requests.filter(r => r.method === 'POST').length}\n`;
  md += `- Cookies: ${log.cookies.length}\n`;
  md += `- Forms Found: ${log.formData.length}\n\n`;

  md += '## API Endpoints\n\n';
  const apiReqs = log.requests.filter(r =>
    r.method === 'POST' || r.url.includes('api') || r.url.includes('calculate')
  );

  if (apiReqs.length === 0) {
    md += 'No API endpoints detected. The application may use:\n';
    md += '- Server-side rendering only\n';
    md += '- Full page form submissions\n';
    md += '- Client-side JavaScript with no separate API\n\n';
  } else {
    apiReqs.forEach(req => {
      md += `### ${req.method} ${req.url}\n\n`;
      md += '**Headers:**\n```json\n' + JSON.stringify(req.headers, null, 2) + '\n```\n\n';
      if (req.postData) {
        md += '**POST Data:**\n```\n' + req.postData + '\n```\n\n';
      }
    });
  }

  md += '## Session Management\n\n';
  md += '**Cookies:**\n\n';
  log.cookies.forEach(cookie => {
    md += `- \`${cookie.name}\`: ${cookie.value.substring(0, 50)}...\n`;
    md += `  - Domain: ${cookie.domain}\n`;
    md += `  - Secure: ${cookie.secure}\n`;
    md += `  - HttpOnly: ${cookie.httpOnly}\n\n`;
  });

  md += '## CSRF Tokens\n\n';
  if (Object.keys(log.sessionInfo.csrfTokens || {}).length > 0) {
    Object.entries(log.sessionInfo.csrfTokens).forEach(([key, value]) => {
      md += `- \`${key}\`: \`${value.substring(0, 50)}...\`\n`;
    });
  } else {
    md += 'No CSRF tokens detected.\n';
  }

  md += '\n## Forms\n\n';
  log.formData.forEach((form, idx) => {
    md += `### Form ${idx + 1}\n\n`;
    md += `- **Action:** ${form.action || 'None (client-side)'}\n`;
    md += `- **Method:** ${form.method || 'GET'}\n`;
    md += `- **Inputs:** ${form.inputs.length}\n\n`;

    if (form.inputs.length > 0) {
      md += '**Input Fields:**\n\n';
      form.inputs.forEach(input => {
        md += `- ${input.type} - \`${input.name}\` (id: ${input.id})\n`;
        if (input.value && input.type === 'hidden') {
          md += `  Value: \`${input.value.substring(0, 50)}...\`\n`;
        }
      });
      md += '\n';
    }
  });

  md += '## Recommended Approach\n\n';

  if (apiReqs.length > 0) {
    md += '✅ **Direct API calls possible!**\n\n';
    md += 'You can likely bypass Selenium by making direct HTTP requests to the API endpoints listed above.\n\n';
    md += '### Implementation Steps:\n\n';
    md += '1. Replicate the session initialization (cookies, tokens)\n';
    md += '2. Make POST requests to the API endpoints\n';
    md += '3. Parse JSON responses instead of scraping HTML\n';
    md += '4. **Performance improvement: 20-30 seconds → 2-5 seconds**\n\n';
  } else {
    md += '❌ **No API detected**\n\n';
    md += 'This application appears to use traditional form submissions without a separate API.\n\n';
    md += '### Options:\n\n';
    md += '1. Continue using Selenium (current approach)\n';
    md += '2. Implement caching to reduce duplicate calculations\n';
    md += '3. Use background workers to avoid blocking\n';
    md += '4. Contact CRA to request official API access\n\n';
  }

  return md;
}

// Run the investigation
investigateCRAAPI().catch(console.error);
