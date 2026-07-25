/**
 * FINAL TEST: All Canadian provinces in ONE session
 * Proves the scraper works across all provinces!
 */

const HybridCRAScraperWithExpiry = require('./HybridCRAScraperWithExpiry');

async function testAllProvincesOneSession() {
  console.log('🇨🇦 Testing ALL Canadian Provinces in ONE Session\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraperWithExpiry();
  const startTime = Date.now();

  const provinces = [
    { name: 'Ontario', salary: 5000 },
    { name: 'Quebec', salary: 5500 },
    { name: 'British Columbia', salary: 6000 },
    { name: 'Alberta', salary: 5200 },
    { name: 'Manitoba', salary: 4800 },
    { name: 'Saskatchewan', salary: 4500 },
    { name: 'Nova Scotia', salary: 4200 },
    { name: 'New Brunswick', salary: 4000 },
    { name: 'Newfoundland and Labrador', salary: 4700 },
    { name: 'Prince Edward Island', salary: 3900 }
  ];

  const results = [];

  try {
    for (let i = 0; i < provinces.length; i++) {
      const prov = provinces[i];
      const calcStart = Date.now();

      console.log(`\n${i + 1}. ${prov.name} ($${prov.salary})`);
      console.log('-'.repeat(80));

      try {
        const result = await scraper.calculate(
          prov.salary,
          prov.name,
          { year: '2025', month: '01', day: '31' }
        );

        const calcTime = Date.now() - calcStart;

        console.log(`   ✅ Net: $${result.totals.net_amount.toFixed(2)}`);
        console.log(`   Federal Tax: $${result.tax_deductions.federal_tax.toFixed(2)}`);
        console.log(`   Provincial Tax: $${result.tax_deductions.provincial_tax.toFixed(2)}`);
        console.log(`   Time: ${calcTime}ms`);

        results.push({
          province: prov.name,
          gross: prov.salary,
          net: result.totals.net_amount,
          time: calcTime
        });

      } catch (error) {
        console.log(`   ❌ FAILED: ${error.message.substring(0, 100)}`);
      }
    }

    const totalTime = Date.now() - startTime;

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Provinces: ${results.length}/${provinces.length}`);
    console.log(`Total Time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`Average per calculation: ${(totalTime / results.length).toFixed(0)}ms`);
    console.log('');

    console.log('Province Breakdown:');
    results.forEach((r, i) => {
      const firstOrReused = i === 0 ? '(session init)' : '(reused)';
      console.log(`  ${r.province.padEnd(30)} $${r.gross} → $${r.net.toFixed(2).padStart(8)} | ${r.time}ms ${firstOrReused}`);
    });

    console.log('\n' + '='.repeat(80));

    if (results.length === provinces.length) {
      console.log('✅ SUCCESS! All provinces work in ONE session!');
      console.log('🎉 No need to group by province!');
    } else {
      console.log(`⚠️ Some provinces failed (${results.length}/${provinces.length})`);
    }

    console.log('='.repeat(80));

    // Performance comparison
    console.log('\n📈 Performance Comparison:');
    console.log(`  This scraper: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`  Old Selenium: ${(provinces.length * 25).toFixed(1)}s (estimated)`);
    console.log(`  Speedup: ${(provinces.length * 25 / (totalTime / 1000)).toFixed(1)}x faster`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await scraper.cleanup();
  }
}

testAllProvincesOneSession().catch(console.error);
