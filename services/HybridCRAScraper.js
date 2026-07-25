/**
 * Hybrid CRA Scraper with Session Reuse & Expiry Tracking
 *
 * Improvements over basic version:
 * ✅ Reuses session tokens until expiry
 * ✅ 20-minute session TTL (conservative estimate)
 * ✅ Auto-refresh on expiry
 * ✅ Even faster for multiple calculations
 */

import puppeteer from 'puppeteer';
import axios from 'axios';

class HybridCRAScraperWithExpiry {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.xsrfToken = null;
    this.cookies = null;
    this.sessionExpiry = null;
    this.sessionTTL = options.sessionTTL || 20 * 60 * 1000; // 20 minutes default

    this.baseURL = 'https://apps.cra-arc.gc.ca/ebci/rhpd';
    this.apiURL = `${this.baseURL}/rest/api/ext/priv/calculator/SALARY`;
  }

  /**
   * Check if current session is still valid
   */
  isSessionValid() {
    return this.xsrfToken &&
           this.sessionExpiry &&
           Date.now() < this.sessionExpiry;
  }

  /**
   * Initialize or refresh session
   */
  async initializeSession() {
    // Reuse existing session if still valid
    if (this.isSessionValid()) {
      const remainingMinutes = Math.floor((this.sessionExpiry - Date.now()) / 1000 / 60);
      console.log(`   ✓ Reusing cached session (${remainingMinutes} min remaining)`);
      return;
    }

    console.log('🔑 Initializing new session...');
    const startTime = Date.now();

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      this.page = await this.browser.newPage();

      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await this.page.goto(`${this.baseURL}/beta/step1`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      this.cookies = await this.page.cookies();
      const xsrfCookie = this.cookies.find(c => c.name === 'XSRF-TOKEN');

      if (!xsrfCookie) {
        throw new Error('XSRF token not found in cookies');
      }

      this.xsrfToken = xsrfCookie.value;
      this.sessionExpiry = Date.now() + this.sessionTTL;

      const duration = Date.now() - startTime;
      const expiryTime = new Date(this.sessionExpiry).toLocaleTimeString();

      console.log(`   ✓ Session initialized in ${duration}ms`);
      console.log(`   ✓ Token valid until ${expiryTime} (~${Math.floor(this.sessionTTL/60000)} min)\n`);

    } catch (error) {
      console.error('   ✗ Session initialization failed:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Normalize province name
   */
  normalizeProvince(province) {
    if (!province) return 'ONTARIO';

    const normalized = province.toUpperCase().trim().replace(/\s+/g, '_');

    const provinceMap = {
      'ON': 'ONTARIO',
      'AB': 'ALBERTA',
      'BC': 'BRITISH_COLUMBIA',
      'MB': 'MANITOBA',
      'NB': 'NEW_BRUNSWICK',
      'NL': 'NEWFOUNDLAND_AND_LABRADOR',
      'NS': 'NOVA_SCOTIA',
      'PE': 'PRINCE_EDWARD_ISLAND',
      'QC': 'QUEBEC',
      'SK': 'SASKATCHEWAN',
      'NT': 'NORTHWEST_TERRITORIES',
      'NU': 'NUNAVUT',
      'YT': 'YUKON'
    };

    return provinceMap[normalized] || normalized;
  }

  /**
   * Build calculation payload
   */
  buildPayload(grossSalary, province, paymentDate, payPeriodFrequency = 'MONTHLY_12PP') {
    let payDate;
    if (typeof paymentDate === 'string') {
      payDate = new Date(paymentDate).toISOString();
    } else if (paymentDate.year) {
      payDate = new Date(`${paymentDate.year}-${paymentDate.month}-${paymentDate.day}`).toISOString();
    } else {
      payDate = new Date(paymentDate).toISOString();
    }

    const jurisdiction = this.normalizeProvince(province);

    return {
      calculationType: 'SALARY',
      jurisdiction,
      payPeriodFrequency,
      datePaid: payDate,
      incomeAmount: parseFloat(grossSalary),
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
      retroactivePay: null
    };
  }

  /**
   * Parse secure JSON response
   */
  parseSecureJSON(data) {
    const str = typeof data === 'string' ? data : data.toString();
    return JSON.parse(str.startsWith(")]}',") ? str.slice(5) : str);
  }

  /**
   * Call CRA API
   */
  async callAPI(endpoint, payload) {
    const cookieString = this.cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    const response = await axios.post(
      `${this.apiURL}${endpoint}`,
      payload,
      {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://apps.cra-arc.gc.ca',
          'Referer': `${this.baseURL}/beta/step3`,
          'x-xsrf-token': this.xsrfToken,
          'Cookie': cookieString
        },
        validateStatus: () => true
      }
    );

    if (response.status !== 200) {
      // Check if it's an expired session
      if (response.status === 403 || response.status === 401) {
        console.log('   ⚠️  Session expired, refreshing...');
        this.sessionExpiry = null; // Force refresh
        throw new Error('SESSION_EXPIRED');
      }

      throw new Error(`API returned ${response.status}: ${response.statusText}\n   Response: ${JSON.stringify(response.data).substring(0, 200)}`);
    }

    return this.parseSecureJSON(response.data);
  }

  /**
   * Calculate taxes
   */
  async calculate(grossSalary, province, paymentDate, frequency = 'MONTHLY_12PP', retryCount = 0) {
    const start = Date.now();

    try {
      await this.initializeSession();

      const basePayload = this.buildPayload(grossSalary, province, paymentDate, frequency);

      // Get TD1 claim amounts
      const claimAmounts = await this.callAPI('/calculateClaimAmounts', basePayload);

      // Build full payload with TD1
      // API returns: federalBasicPersonalAmount & provincialTerritoryBasicPersonalAmount
      const fullPayload = {
        ...basePayload,
        td1ClaimAmountFed: claimAmounts.federalBasicPersonalAmount || claimAmounts.td1ClaimAmountFed || 16129,
        td1ClaimAmountProv: claimAmounts.provincialTerritoryBasicPersonalAmount || claimAmounts.td1ClaimAmountProv || 16129,
        federalClaimCode: 'CLAIM_CODE_1',
        provinceTerritoryClaimCode: 'CLAIM_CODE_1',
        td1ClaimCodeType: 'CLAIM_AMOUNT_TD1'
      };

      // Calculate
      const result = await this.callAPI('/calculate', fullPayload);

      const parsed = this.parseResults(result, grossSalary, province, paymentDate);
      parsed._timing = Date.now() - start;

      return parsed;

    } catch (error) {
      // Retry once on session expiry
      if (error.message === 'SESSION_EXPIRED' && retryCount === 0) {
        console.log('   → Retrying with new session...');
        return await this.calculate(grossSalary, province, paymentDate, frequency, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Parse API results
   */
  parseResults(api, grossSalary, province, paymentDate) {
    console.log('📊 Parsing API results:', {
      federalTaxDeduction: api.federalTaxDeduction,
      provincialTaxDeduction: api.provincialTaxDeduction,
      cppOrQppDeductions: api.cppOrQppDeductions,
      employmentInsuranceDeductions: api.employmentInsuranceDeductions,
      totalDeductions: api.totalDeductions,
      netAmount: api.netAmount
    });

    const federalTax = parseFloat(api.federalTaxDeduction) || 0;
    const provincialTax = parseFloat(api.provincialTaxDeduction) || 0;
    const cpp = parseFloat(api.cppOrQppDeductions) || 0;
    const cpp2 = parseFloat(api.cpp2Contributions) || 0;
    const ei = parseFloat(api.employmentInsuranceDeductions) || 0;
    const totalTax = parseFloat(api.totalTaxDeductions) || (federalTax + provincialTax);
    const totalDeductions = parseFloat(api.totalDeductions) || (totalTax + cpp + cpp2 + ei);
    const netAmount = parseFloat(api.netAmount) || (grossSalary - totalDeductions);

    console.log('💰 Calculated values:', {
      federalTax,
      provincialTax,
      cpp,
      ei,
      totalTax,
      totalDeductions,
      netAmount
    });

    return {
      input: {
        gross_salary: grossSalary,
        province,
        payment_date: paymentDate,
        calculation_timestamp: new Date().toISOString()
      },
      tax_deductions: {
        federal_tax: federalTax,
        provincial_tax: provincialTax,
        total_tax: totalTax
      },
      other_deductions: {
        cpp,
        cpp2,
        ei
      },
      totals: {
        total_deductions: totalDeductions,
        net_amount: netAmount
      },
      raw: api
    };
  }

  /**
   * Batch calculate (same province)
   */
  async calculateBatch(calculations) {
    const results = [];

    for (const calc of calculations) {
      const result = await this.calculate(
        calc.salary,
        calc.province,
        calc.date,
        calc.frequency
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.page = null;
    // Keep session data for potential reuse
  }

  /**
   * Force session refresh
   */
  invalidateSession() {
    this.sessionExpiry = null;
    this.xsrfToken = null;
    this.cookies = null;
  }
}

export default HybridCRAScraperWithExpiry;

// Test code removed for production use
// Original test code available in new-scraper-test/HybridCRAScraperWithExpiry.js

/* Test code (commented out for production)
if (require.main === module) {
  (async () => {
    console.log('🧪 Testing Session Reuse\n');
    console.log('='.repeat(80));

    const scraper = new HybridCRAScraperWithExpiry({ sessionTTL: 20 * 60 * 1000 });

    try {
      console.log('Test 1: First calculation (new session)');
      console.log('-'.repeat(80));
      const result1 = await scraper.calculate(5000, 'Ontario',
        { year: '2025', month: '01', day: '31' });
      console.log(`✓ Net: $${result1.totals.net_amount.toFixed(2)} (${result1._timing}ms)\n`);

      console.log('Test 2: Second calculation (reused session)');
      console.log('-'.repeat(80));
      const result2 = await scraper.calculate(4000, 'Ontario',
        { year: '2025', month: '01', day: '31' });
      console.log(`✓ Net: $${result2.totals.net_amount.toFixed(2)} (${result2._timing}ms)\n`);

      console.log('Test 3: Third calculation (reused session)');
      console.log('-'.repeat(80));
      const result3 = await scraper.calculate(6000, 'Ontario',
        { year: '2025', month: '01', day: '31' });
      console.log(`✓ Net: $${result3.totals.net_amount.toFixed(2)} (${result3._timing}ms)\n`);

      console.log('='.repeat(80));
      console.log('✅ All tests passed!');
      console.log(`\nPerformance:`);
      console.log(`  Calc 1: ${result1._timing}ms (includes session init)`);
      console.log(`  Calc 2: ${result2._timing}ms (session reused)`);
      console.log(`  Calc 3: ${result3._timing}ms (session reused)`);
      console.log('='.repeat(80));

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
    } finally {
      await scraper.cleanup();
    }
  })();
}
*/
