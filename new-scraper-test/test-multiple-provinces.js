/**
 * Test if we can actually calculate multiple provinces in one session
 */

const HybridCRAScraper = require('./HybridCRAScraper');

async function testMultipleProvinces() {
  console.log('🧪 Testing Multiple Provinces in Same Session\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraper();

  try {
    // Initialize session once
    await scraper.initializeSession();

    console.log('\n📊 Testing 3 Different Provinces with Same Session:\n');

    // Test 1: Ontario
    console.log('1. Ontario ($5000)');
    const ontario = await scraper.calculate(5000, 'Ontario',
      { year: '2025', month: '01', day: '31' }, 'MONTHLY_12PP');
    console.log(`   ✓ Net: $${ontario.totals.net_amount.toFixed(2)}\n`);

    // Test 2: Alberta
    console.log('2. Alberta ($4000)');
    const alberta = await scraper.calculate(4000, 'Alberta',
      { year: '2025', month: '01', day: '31' }, 'MONTHLY_12PP');
    console.log(`   ✓ Net: $${alberta.totals.net_amount.toFixed(2)}\n`);

    // Test 3: British Columbia
    console.log('3. British Columbia ($6000)');
    const bc = await scraper.calculate(6000, 'British Columbia',
      { year: '2025', month: '01', day: '31' }, 'MONTHLY_12PP');
    console.log(`   ✓ Net: $${bc.totals.net_amount.toFixed(2)}\n`);

    console.log('='.repeat(80));
    console.log('✅ SUCCESS! Multiple provinces work in the same session!');
    console.log('='.repeat(80));
    console.log('\nSummary:');
    console.log(`   Ontario:          $${ontario.totals.net_amount.toFixed(2)}`);
    console.log(`   Alberta:          $${alberta.totals.net_amount.toFixed(2)}`);
    console.log(`   British Columbia: $${bc.totals.net_amount.toFixed(2)}`);
    console.log('\n✅ You can use ONE session for ALL provinces!\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.log('\n⚠️ Different provinces need separate sessions\n');
    throw error;
  } finally {
    await scraper.cleanup();
  }
}

testMultipleProvinces().catch(console.error);
