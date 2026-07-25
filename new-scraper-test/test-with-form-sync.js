/**
 * Test if syncing form fields in browser allows multiple provinces
 */

const puppeteer = require('puppeteer');
const axios = require('axios');

class HybridWithFormSync {
  constructor() {
    this.browser = null;
    this.page = null;
    this.xsrfToken = null;
    this.cookies = null;
    this.baseURL = 'https://apps.cra-arc.gc.ca/ebci/rhpd';
    this.apiURL = `${this.baseURL}/rest/api/ext/priv/calculator/SALARY`;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    await this.page.goto(`${this.baseURL}/beta/step1`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await this.page.waitForTimeout(2000);

    this.cookies = await this.page.cookies();
    const xsrfCookie = this.cookies.find(c => c.name === 'XSRF-TOKEN');
    this.xsrfToken = xsrfCookie?.value;

    console.log('✓ Session initialized');
  }

  async syncFormFields(province, payFrequency, date) {
    console.log(`   → Syncing form: ${province}...`);

    // Fill province
    await this.page.evaluate((prov) => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options).map(o => o.value);
        if (options.includes(prov)) {
          select.value = prov;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }, province);

    await this.page.waitForTimeout(500);

    // Fill pay frequency
    await this.page.evaluate((freq) => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options).map(o => o.value);
        if (options.includes(freq)) {
          select.value = freq;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }, payFrequency);

    await this.page.waitForTimeout(500);

    console.log('   → Form synced');
  }

  parseSecureJSON(data) {
    if (typeof data === 'string' && data.startsWith(")]}',")) {
      return JSON.parse(data.substring(5));
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async callAPI(endpoint, payload) {
    const cookieString = this.cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const response = await axios.post(
      `${this.apiURL}${endpoint}`,
      payload,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://apps.cra-arc.gc.ca',
          'Referer': `${this.baseURL}/beta/step1`,
          'x-xsrf-token': this.xsrfToken,
          'Cookie': cookieString
        },
        validateStatus: () => true
      }
    );

    if (response.status !== 200) {
      throw new Error(`API Error ${response.status}: ${JSON.stringify(response.data).substring(0, 200)}`);
    }

    return this.parseSecureJSON(response.data);
  }

  buildPayload(salary, province, date, frequency) {
    return {
      calculationType: 'SALARY',
      jurisdiction: province,
      payPeriodFrequency: frequency,
      datePaid: new Date(`${date.year}-${date.month}-${date.day}`).toISOString(),
      incomeAmount: parseFloat(salary),
      salaryType: 'NO_BONUS_PAY_NO_RETROACTIVE_PAY',
      cppQppType: 'CPP_QPP_YEAR_TO_DATE',
      numberPensionableMonths: 12,
      employmentInsuranceType: 'EI_YEAR_TO_DATE',
      employerEmploymentInsurancePremiumRate: 1.4,
      cppEqualizationFlag: false,
      clergyFlag: 'FALSE',
      taxableBenefitsFlag: false,
      quebecTaxableBenefitsFlag: false,
      unionDuesFlag: false,
      contributionEmployerRrspFlag: false,
      contributionRrspOrRppOrPrppFlag: false,
      taxIndigenousFlag: false,
      federalTd1DisplayableFlag: false,
      provincialTd1DisplayableFlag: false,
      clergyType: 'NO_HOUSING',
      pensionableEarningsYearToDate: null,
      cppOrQppContributionsDeductedYearToDate: null,
      secondAdditionalCppOrQppContributionsDeductedYearToDate: null,
      insurableEarningsYearToDate: null,
      employmentInsuranceDeductedYearToDate: null,
      vacationPay: null,
      retroactivePay: null,
      employeeName: null,
      employerName: null
    };
  }

  async calculate(salary, province, date, frequency = 'MONTHLY_12PP') {
    console.log(`\n💰 ${province} - $${salary}`);

    // SYNC FORM FIELDS FIRST
    await this.syncFormFields(province, frequency, date);

    // Get base payload
    const basePayload = this.buildPayload(salary, province, date, frequency);

    // Call calculateClaimAmounts
    console.log('   → Getting TD1 amounts...');
    const claimAmounts = await this.callAPI('/calculateClaimAmounts', basePayload);

    // Add TD1 to payload
    const fullPayload = {
      ...basePayload,
      td1ClaimAmountFed: claimAmounts.td1ClaimAmountFed || 16129,
      td1ClaimAmountProv: claimAmounts.td1ClaimAmountProv || 16129,
      federalClaimCode: 'CLAIM_CODE_1',
      provinceTerritoryClaimCode: 'CLAIM_CODE_1',
      td1ClaimCodeType: 'CLAIM_AMOUNT_TD1'
    };

    // Calculate
    console.log('   → Calculating...');
    const result = await this.callAPI('/calculate', fullPayload);

    const net = result.netAmount || (salary - (result.totalDeductions || 0));
    console.log(`   ✓ Net: $${net.toFixed(2)}`);

    return result;
  }

  async cleanup() {
    if (this.browser) await this.browser.close();
  }
}

async function test() {
  console.log('🧪 Testing Form Sync Approach\n');
  console.log('='.repeat(80));

  const scraper = new HybridWithFormSync();

  try {
    await scraper.initialize();

    console.log('\n📊 Testing 3 Different Provinces (WITH form sync):\n');

    // Test 1: Ontario
    await scraper.calculate(5000, 'ONTARIO',
      { year: '2025', month: '01', day: '31' }, 'MONTHLY_12PP');

    // Test 2: Alberta
    await scraper.calculate(4000, 'ALBERTA',
      { year: '2025', month: '01', day: '31' }, 'MONTHLY_12PP');

    // Test 3: BC
    await scraper.calculate(6000, 'BRITISH_COLUMBIA',
      { year: '2025', month: '01', day: '31' }, 'MONTHLY_12PP');

    console.log('\n' + '='.repeat(80));
    console.log('✅ SUCCESS! Form sync allows multiple provinces!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.log('\n⚠️ Form sync did not help - provinces still need separate sessions');
  } finally {
    await scraper.cleanup();
  }
}

test().catch(console.error);
