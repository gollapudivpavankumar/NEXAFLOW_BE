// Copy the user's ultra-fast scraper code
const https = require('https');

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 30000,
  scheduling: 'fifo'
});

class UltraFastCRAScraper {
  constructor(options = {}) {
    this.baseURL = 'https://apps.cra-arc.gc.ca';
    this.apiPath = '/ebci/rhpd/rest/api/ext/priv/calculator/SALARY';

    this.xsrfToken = null;
    this.cookies = {};
    this.sessionExpiry = null;
    this.sessionTTL = options.sessionTTL || 25 * 60 * 1000;

    this.TD1_FEDERAL = 16129;
    this.TD1_PROVINCIAL = {
      ONTARIO: 12747, ALBERTA: 21885, BRITISH_COLUMBIA: 12580,
      MANITOBA: 15780, NEW_BRUNSWICK: 14042, NEWFOUNDLAND_AND_LABRADOR: 10382,
      NOVA_SCOTIA: 8744, PRINCE_EDWARD_ISLAND: 13500, QUEBEC: 18056,
      SASKATCHEWAN: 18491, NORTHWEST_TERRITORIES: 16593, NUNAVUT: 19426, YUKON: 16129
    };

    this.provinceCache = new Map();
  }

  async httpRequest(options, body = null) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'apps.cra-arc.gc.ca',
        agent: httpsAgent,
        ...options
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  async initializeSession() {
    if (this.xsrfToken && this.sessionExpiry && Date.now() < this.sessionExpiry) {
      console.log('   ✓ Reusing cached session');
      return;
    }

    const startTime = Date.now();
    console.log('🔑 Initializing session via pure HTTP...');

    const response = await this.httpRequest({
      method: 'GET',
      path: '/ebci/rhpd/beta/step1',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      }
    });

    if (response.status !== 200) {
      throw new Error(`Session init failed: HTTP ${response.status}`);
    }

    // Parse cookies
    const setCookies = response.headers['set-cookie'] || [];
    this.cookies = {};

    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const [name, value] = pair.split('=');
      this.cookies[name.trim()] = value?.trim() || '';

      if (name.trim() === 'XSRF-TOKEN') {
        this.xsrfToken = decodeURIComponent(value.trim());
      }
    }

    if (!this.xsrfToken) {
      // Try to extract from HTML
      const match = response.data.match(/XSRF-TOKEN['"]\s*:\s*['"]([^'"]+)['"]/);
      if (match) {
        this.xsrfToken = match[1];
      } else {
        throw new Error('XSRF token not found in cookies or HTML');
      }
    }

    this.sessionExpiry = Date.now() + this.sessionTTL;
    console.log(`   ✓ Session initialized in ${Date.now() - startTime}ms`);
    console.log(`   ✓ XSRF Token: ${this.xsrfToken.substring(0, 30)}...`);
  }

  getCookieString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  normalizeProvince(province) {
    if (this.provinceCache.has(province)) {
      return this.provinceCache.get(province);
    }

    const normalized = province.includes('_') || province === province.toUpperCase()
      ? province
      : province.toUpperCase().replace(/\s+/g, '_');

    this.provinceCache.set(province, normalized);
    return normalized;
  }

  buildMinimalPayload(grossSalary, province, paymentDate, frequency) {
    const jurisdiction = this.normalizeProvince(province);

    let datePaid;
    if (typeof paymentDate === 'string') {
      datePaid = new Date(paymentDate).toISOString();
    } else if (paymentDate.year) {
      datePaid = `${paymentDate.year}-${String(paymentDate.month).padStart(2, '0')}-${String(paymentDate.day).padStart(2, '0')}T00:00:00.000Z`;
    } else {
      datePaid = paymentDate.toISOString();
    }

    return {
      calculationType: 'SALARY',
      jurisdiction,
      payPeriodFrequency: frequency,
      datePaid,
      incomeAmount: grossSalary,
      salaryType: 'NO_BONUS_PAY_NO_RETROACTIVE_PAY',
      td1ClaimAmountFed: this.TD1_FEDERAL,
      td1ClaimAmountProv: this.TD1_PROVINCIAL[jurisdiction] || this.TD1_FEDERAL,
      federalClaimCode: 'CLAIM_CODE_1',
      provinceTerritoryClaimCode: 'CLAIM_CODE_1',
      td1ClaimCodeType: 'CLAIM_AMOUNT_TD1',
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
      employmentInsuranceDeductedYearToDate: null
    };
  }

  parseSecureJSON(data) {
    const str = typeof data === 'string' ? data : data.toString();
    return JSON.parse(str.startsWith(")]}',") ? str.slice(5) : str);
  }

  async callCalculateAPI(payload) {
    const body = JSON.stringify(payload);

    const response = await this.httpRequest({
      method: 'POST',
      path: `${this.apiPath}/calculate`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': this.baseURL,
        'Referer': `${this.baseURL}/ebci/rhpd/beta/step3`,
        'x-xsrf-token': this.xsrfToken,
        'Cookie': this.getCookieString(),
        'Connection': 'keep-alive'
      }
    }, body);

    if (response.status !== 200) {
      console.error('   ✗ API Error:', response.data.substring(0, 300));
      throw new Error(`API error: HTTP ${response.status}`);
    }

    return this.parseSecureJSON(response.data);
  }

  async calculate(grossSalary, province, paymentDate, frequency = 'MONTHLY_12PP') {
    const start = Date.now();

    await this.initializeSession();

    console.log(`💰 Calculating $${grossSalary} (${province})...`);
    const payload = this.buildMinimalPayload(grossSalary, province, paymentDate, frequency);
    const response = await this.callCalculateAPI(payload);

    const result = this.parseResults(response, grossSalary, province, paymentDate);
    result._timing = Date.now() - start;

    console.log(`   ✓ Net: $${result.totals.net_amount.toFixed(2)} (${result._timing}ms)`);

    return result;
  }

  parseResults(api, grossSalary, province, paymentDate) {
    const federalTax = api.federalTaxDeduction || 0;
    const provincialTax = api.provincialTaxDeduction || 0;
    const cpp = api.cppContributions || 0;
    const cpp2 = api.cpp2Contributions || 0;
    const ei = api.eiPremiums || 0;
    const totalTax = api.totalTaxDeductions || (federalTax + provincialTax);
    const totalDeductions = api.totalDeductions || (totalTax + cpp + cpp2 + ei);
    const netAmount = api.netAmount || (grossSalary - totalDeductions);

    return {
      input: { gross_salary: grossSalary, province, payment_date: paymentDate },
      tax_deductions: { federal_tax: federalTax, provincial_tax: provincialTax, total_tax: totalTax },
      other_deductions: { cpp, cpp2, ei },
      totals: { total_deductions: totalDeductions, net_amount: netAmount }
    };
  }

  cleanup() {
    this.xsrfToken = null;
    this.cookies = {};
    this.sessionExpiry = null;
  }
}

module.exports = UltraFastCRAScraper;

// Test
if (require.main === module) {
  (async () => {
    console.log('🧪 Testing Ultra-Fast HTTP-Only Scraper\n');
    console.log('='.repeat(80));

    const scraper = new UltraFastCRAScraper();

    try {
      console.log('\nTEST 1: Can we get XSRF token via pure HTTP?');
      console.log('-'.repeat(80));
      await scraper.initializeSession();

      console.log('\nTEST 2: Multiple provinces with hardcoded TD1');
      console.log('-'.repeat(80));

      await scraper.calculate(5000, 'ONTARIO', { year: '2025', month: '01', day: '31' });
      await scraper.calculate(4000, 'ALBERTA', { year: '2025', month: '01', day: '31' });
      await scraper.calculate(6000, 'BRITISH_COLUMBIA', { year: '2025', month: '01', day: '31' });

      console.log('\n' + '='.repeat(80));
      console.log('✅ SUCCESS! Pure HTTP works AND multiple provinces work!');
      console.log('='.repeat(80));

    } catch (error) {
      console.error('\n❌ FAILED:', error.message);
    } finally {
      scraper.cleanup();
    }
  })();
}
