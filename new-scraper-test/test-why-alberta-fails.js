/**
 * Test: Why does Alberta fail but BC succeeds?
 */

const HybridCRAScraperWithExpiry = require('./HybridCRAScraperWithExpiry');

async function investigateAlbertaIssue() {
  console.log('🔍 Investigating: Why Alberta fails but BC works\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraperWithExpiry();

  try {
    await scraper.initializeSession();

    // Test 1: Ontario
    console.log('\n1️⃣ Ontario');
    const ont = await scraper.calculate(5000, 'Ontario', { year: '2025', month: '01', day: '31' });
    console.log(`   Net: $${ont.totals.net_amount.toFixed(2)}`);
    console.log(`   Federal TD1: $${ont.raw.td1ClaimAmountFed || 'N/A'}`);
    console.log(`   Provincial TD1: $${ont.raw.td1ClaimAmountProv || 'N/A'}`);

    // Test 2: Alberta
    console.log('\n2️⃣ Alberta');
    try {
      const alb = await scraper.calculate(5000, 'Alberta', { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ Net: $${alb.totals.net_amount.toFixed(2)}`);
      console.log(`   Federal TD1: $${alb.raw.td1ClaimAmountFed || 'N/A'}`);
      console.log(`   Provincial TD1: $${alb.raw.td1ClaimAmountProv || 'N/A'}`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message.substring(0, 150)}`);
    }

    // Test 3: BC
    console.log('\n3️⃣ British Columbia');
    const bc = await scraper.calculate(5000, 'British Columbia', { year: '2025', month: '01', day: '31' });
    console.log(`   ✅ Net: $${bc.totals.net_amount.toFixed(2)}`);
    console.log(`   Federal TD1: $${bc.raw.td1ClaimAmountFed || 'N/A'}`);
    console.log(`   Provincial TD1: $${bc.raw.td1ClaimAmountProv || 'N/A'}`);

    // Test 4: Manitoba
    console.log('\n4️⃣ Manitoba');
    try {
      const mb = await scraper.calculate(5000, 'Manitoba', { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ Net: $${mb.totals.net_amount.toFixed(2)}`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message.substring(0, 150)}`);
    }

    // Test 5: Saskatchewan
    console.log('\n5️⃣ Saskatchewan');
    try {
      const sk = await scraper.calculate(5000, 'Saskatchewan', { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ Net: $${sk.totals.net_amount.toFixed(2)}`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message.substring(0, 150)}`);
    }

    // Test 6: Quebec
    console.log('\n6️⃣ Quebec');
    try {
      const qc = await scraper.calculate(5000, 'Quebec', { year: '2025', month: '01', day: '31' });
      console.log(`   ✅ Net: $${qc.totals.net_amount.toFixed(2)}`);
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message.substring(0, 150)}`);
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await scraper.cleanup();
  }
}

// Test: Check the TD1 amounts we're using
async function checkTD1Amounts() {
  console.log('\n\n📊 Checking TD1 Amounts in Code\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraperWithExpiry();

  // Check hardcoded TD1 amounts
  const payload = scraper.buildPayload(5000, 'Alberta', { year: '2025', month: '01', day: '31' });

  console.log('Alberta payload:');
  console.log(`  td1ClaimAmountFed: ${payload.td1ClaimAmountFed || 'undefined'}`);
  console.log(`  td1ClaimAmountProv: ${payload.td1ClaimAmountProv || 'undefined'}`);

  // Now check what calculateClaimAmounts actually returns
  await scraper.initializeSession();

  console.log('\nCalling /calculateClaimAmounts for Alberta...');
  try {
    const claimAmounts = await scraper.callAPI('/calculateClaimAmounts', payload);
    console.log('Response:', JSON.stringify(claimAmounts, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }

  await scraper.cleanup();
}

(async () => {
  await investigateAlbertaIssue();
  await checkTD1Amounts();
})();
