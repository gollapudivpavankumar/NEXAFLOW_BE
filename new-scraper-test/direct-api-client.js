/**
 * CRA Payroll Calculator - Direct API Client
 *
 * This client makes direct HTTP requests to the CRA API
 * instead of using slow Selenium browser automation.
 *
 * DISCOVERED API ENDPOINTS:
 * - Base URL: https://apps.cra-arc.gc.ca/ebci/rhpd/rest/api/ext/priv/
 * - Authentication: XSRF-TOKEN (cookie) + JSESSIONID (session cookie)
 * - Response Format: JSON with security prefix ")]}',\n"
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

class CRADirectAPI {
  constructor() {
    this.baseURL = 'https://apps.cra-arc.gc.ca/ebci/rhpd';
    this.apiURL = `${this.baseURL}/rest/api/ext/priv`;

    // Setup cookie jar for session management
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://apps.cra-arc.gc.ca',
        'Referer': 'https://apps.cra-arc.gc.ca/ebci/rhpd/beta/step1'
      }
    }));

    this.xsrfToken = null;
    this.sessionId = null;
  }

  /**
   * Initialize session by loading the main page
   * This gets us the XSRF-TOKEN and JSESSIONID cookies
   */
  async initializeSession() {
    console.log('🔑 Initializing session...');

    try {
      // Load the main page to get cookies
      const response = await this.client.get(`${this.baseURL}/beta/step1`);

      // Extract XSRF token from cookies
      const cookies = await this.jar.getCookies(this.baseURL);
      const xsrfCookie = cookies.find(c => c.key === 'XSRF-TOKEN');
      const sessionCookie = cookies.find(c => c.key === 'JSESSIONID');

      if (xsrfCookie) {
        this.xsrfToken = xsrfCookie.value;
        console.log(`   ✓ XSRF-TOKEN: ${this.xsrfToken.substring(0, 20)}...`);
      }

      if (sessionCookie) {
        this.sessionId = sessionCookie.value;
        console.log(`   ✓ JSESSIONID: ${this.sessionId.substring(0, 20)}...`);
      }

      // Set XSRF token header for future requests
      if (this.xsrfToken) {
        this.client.defaults.headers.common['X-XSRF-TOKEN'] = this.xsrfToken;
      }

      console.log('   ✓ Session initialized successfully\n');
      return true;

    } catch (error) {
      console.error('   ✗ Failed to initialize session:', error.message);
      return false;
    }
  }

  /**
   * Strip the security prefix from CRA API responses
   * They prepend ")]}',\n" to prevent JSON hijacking
   */
  parseSecureJSON(data) {
    if (typeof data === 'string' && data.startsWith(")]}',")) {
      return JSON.parse(data.substring(5));
    }
    return data;
  }

  /**
   * Make API request with proper error handling
   */
  async apiRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.apiURL}${endpoint}`,
        transformResponse: [(data) => {
          return this.parseSecureJSON(data);
        }]
      };

      if (data) {
        config.data = data;
        config.headers = {
          'Content-Type': 'application/json'
        };
      }

      const response = await this.client(config);
      return response.data;

    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get calculator configuration
   */
  async getCalculatorConfig() {
    console.log('📋 Getting calculator configuration...');
    const config = await this.apiRequest('GET', '/log/cfg');
    console.log('   Config:', config);
    return config;
  }

  /**
   * Get links/resources
   */
  async getLinks(lang = 'en') {
    console.log(`🔗 Getting links (${lang})...`);
    const links = await this.apiRequest('GET', `/links/${lang}`);
    return links;
  }

  /**
   * Get app version
   */
  async getAppVersion() {
    const version = await this.apiRequest('GET', '/calculator/getappversion');
    console.log(`   App version: ${version}`);
    return version;
  }

  /**
   * MAIN CALCULATION FUNCTION
   * This is what we need to reverse-engineer further
   *
   * We need to find the actual calculate endpoint by:
   * 1. Monitoring network when clicking "Calculate" button
   * 2. Looking at the form submission endpoint
   * 3. Checking for /calculator/calculate or similar
   */
  async calculatePayroll(params) {
    console.log('\n💰 Attempting payroll calculation...');
    console.log('   Params:', params);

    // These are potential endpoints - need to verify which one works
    const potentialEndpoints = [
      '/calculator/calculate',
      '/calculator/salary',
      '/calculator/submit',
      '/payroll/calculate',
      '/deductions/calculate'
    ];

    for (const endpoint of potentialEndpoints) {
      try {
        console.log(`   Trying: ${endpoint}`);
        const result = await this.apiRequest('POST', endpoint, params);
        console.log(`   ✓ Success! Endpoint: ${endpoint}`);
        return result;
      } catch (error) {
        console.log(`   ✗ Failed: ${error.response?.status || error.message}`);
      }
    }

    throw new Error('Could not find working calculation endpoint');
  }

  /**
   * TEST: Try to discover calculation endpoint structure
   */
  async discoverCalculationFlow() {
    console.log('\n🔍 DISCOVERING CALCULATION FLOW\n');
    console.log('='.repeat(60));

    await this.initializeSession();
    await this.getCalculatorConfig();
    await this.getAppVersion();

    // Try to understand the flow
    console.log('\n📝 To complete the API discovery, we need to:');
    console.log('   1. Monitor network requests when submitting the actual form');
    console.log('   2. Identify the POST endpoint that receives calculation data');
    console.log('   3. Understand the request payload structure');
    console.log('\n   Run the enhanced Puppeteer script to capture this...\n');
  }
}

// Export for use in other modules
module.exports = CRADirectAPI;

// Test if run directly
if (require.main === module) {
  (async () => {
    const api = new CRADirectAPI();

    try {
      await api.discoverCalculationFlow();

      // Example: Try a calculation (will likely fail until we find the right endpoint)
      // await api.calculatePayroll({
      //   province: 'ON',
      //   salary: 5000,
      //   payPeriod: 'MONTHLY',
      //   paymentDate: '2025-01-31'
      // });

    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}
