/**
 * Test: Is the token province-specific, or is it something else?
 *
 * We'll use the SAME token and try different provinces
 */

const HybridCRAScraperWithExpiry = require('./HybridCRAScraperWithExpiry');

async function testTokenAcrossProvinces() {
  console.log('🧪 Testing: Does the SAME token work for multiple provinces?\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraperWithExpiry();

  try {
    // Initialize session ONCE
    console.log('\n1️⃣ Initialize session (get token)');
    await scraper.initializeSession();

    const token = scraper.xsrfToken;
    console.log(`   Token: ${token.substring(0, 40)}...`);
    console.log(`   Session ID: ${scraper.cookies.find(c => c.name === 'JSESSIONID')?.value.substring(0, 30)}...`);
    console.log('');

    // Test 1: Ontario
    console.log('2️⃣ Test Ontario (first province)');
    console.log('-'.repeat(80));

    try {
      const ontario = await scraper.calculate(5000, 'Ontario',
        { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ SUCCESS - Net: $${ontario.totals.net_amount.toFixed(2)}`);
      console.log(`   Token still: ${scraper.xsrfToken.substring(0, 40)}...`);
      console.log('');
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
    }

    // Test 2: Alberta (SAME TOKEN)
    console.log('3️⃣ Test Alberta (same token, different province)');
    console.log('-'.repeat(80));
    console.log(`   Using SAME token: ${scraper.xsrfToken.substring(0, 40)}...`);

    try {
      const alberta = await scraper.calculate(4000, 'Alberta',
        { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ SUCCESS - Net: $${alberta.totals.net_amount.toFixed(2)}`);
      console.log('');
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
      console.log(`   Error type: ${error.response?.status || 'Unknown'}`);
      console.log('');

      // Show the actual API error
      if (error.message.includes('td1ClaimAmount')) {
        console.log('   📊 Analysis: This is a VALIDATION error, not a token error');
        console.log('   The token is valid, but the server rejects the TD1 amounts');
        console.log('   for Alberta when session was initialized with Ontario.\n');
      }
    }

    // Test 3: Try calling TD1 endpoint for Alberta
    console.log('4️⃣ Test: Call calculateClaimAmounts for Alberta');
    console.log('-'.repeat(80));
    console.log(`   Using SAME token: ${scraper.xsrfToken.substring(0, 40)}...`);

    try {
      const payload = scraper.buildPayload(4000, 'Alberta',
        { year: '2025', month: '01', day: '31' });

      const claimAmounts = await scraper.callAPI('/calculateClaimAmounts', payload);

      console.log(`   ✅ Token works! Got TD1 amounts for Alberta:`);
      console.log(`      Federal: $${claimAmounts.td1ClaimAmountFed}`);
      console.log(`      Provincial: $${claimAmounts.td1ClaimAmountProv}`);
      console.log('');

      // Now try calculate with these values
      console.log('5️⃣ Test: Call calculate for Alberta with correct TD1');
      console.log('-'.repeat(80));

      const fullPayload = {
        ...payload,
        td1ClaimAmountFed: claimAmounts.td1ClaimAmountFed,
        td1ClaimAmountProv: claimAmounts.td1ClaimAmountProv,
        federalClaimCode: 'CLAIM_CODE_1',
        provinceTerritoryClaimCode: 'CLAIM_CODE_1',
        td1ClaimCodeType: 'CLAIM_AMOUNT_TD1'
      };

      const albertaResult = await scraper.callAPI('/calculate', fullPayload);
      console.log(`   ✅ SUCCESS - Net: $${albertaResult.netAmount.toFixed(2)}`);
      console.log('');

    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
    }

    // Test 4: BC (third province)
    console.log('6️⃣ Test BC (third province, same token)');
    console.log('-'.repeat(80));

    try {
      const bc = await scraper.calculate(6000, 'British Columbia',
        { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ SUCCESS - Net: $${bc.totals.net_amount.toFixed(2)}`);
      console.log('');
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
    }

    console.log('='.repeat(80));
    console.log('📊 TEST COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
  } finally {
    await scraper.cleanup();
  }
}

// Also test: Does calling TD1 endpoint change session state?
async function testTD1EndpointBehavior() {
  console.log('\n\n🧪 Testing: Does calling /calculateClaimAmounts lock the session?\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraperWithExpiry();

  try {
    await scraper.initializeSession();
    console.log('Session initialized\n');

    // Call TD1 for Ontario
    console.log('1️⃣ Call calculateClaimAmounts for ONTARIO');
    const payload1 = scraper.buildPayload(5000, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    const td1Ontario = await scraper.callAPI('/calculateClaimAmounts', payload1);
    console.log(`   Ontario TD1: Fed=$${td1Ontario.td1ClaimAmountFed}, Prov=$${td1Ontario.td1ClaimAmountProv}\n`);

    // Now call TD1 for Alberta
    console.log('2️⃣ Call calculateClaimAmounts for ALBERTA (same session)');
    const payload2 = scraper.buildPayload(4000, 'Alberta',
      { year: '2025', month: '01', day: '31' });

    try {
      const td1Alberta = await scraper.callAPI('/calculateClaimAmounts', payload2);
      console.log(`   ✅ Alberta TD1: Fed=$${td1Alberta.td1ClaimAmountFed}, Prov=$${td1Alberta.td1ClaimAmountProv}`);
      console.log('\n   💡 The /calculateClaimAmounts endpoint works for multiple provinces!\n');
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
      console.log('   💡 The /calculateClaimAmounts endpoint is province-locked\n');
    }

    // Now try calling /calculate for Alberta
    console.log('3️⃣ Call /calculate for ALBERTA');
    try {
      const fullPayload = {
        ...payload2,
        td1ClaimAmountFed: 16129,
        td1ClaimAmountProv: 21885, // Alberta amount
        federalClaimCode: 'CLAIM_CODE_1',
        provinceTerritoryClaimCode: 'CLAIM_CODE_1',
        td1ClaimCodeType: 'CLAIM_AMOUNT_TD1'
      };

      const result = await scraper.callAPI('/calculate', fullPayload);
      console.log(`   ✅ SUCCESS - Net: $${result.netAmount.toFixed(2)}`);
      console.log('\n   🎉 The /calculate endpoint works for multiple provinces!\n');
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
      console.log('   💡 The /calculate endpoint is province-locked\n');
    }

    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await scraper.cleanup();
  }
}

// Run both tests
(async () => {
  await testTokenAcrossProvinces();
  await testTD1EndpointBehavior();
})();
