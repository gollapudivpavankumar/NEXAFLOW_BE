/**
 * Test XSRF token expiration
 * Tests how long a token remains valid
 */

const HybridCRAScraper = require('./HybridCRAScraper');

async function testTokenExpiry() {
  console.log('🧪 Testing XSRF Token Expiration\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraper();

  try {
    // Initialize session
    console.log('\n1️⃣ Initializing session...');
    await scraper.initializeSession();
    console.log('   ✓ Token obtained\n');

    // Immediate test
    console.log('2️⃣ Test 1: Immediate calculation (should work)');
    await scraper.calculate(5000, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    console.log('   ✓ SUCCESS\n');

    // Wait 5 minutes
    console.log('3️⃣ Test 2: After 5 minutes (should work)');
    console.log('   ⏳ Waiting 5 minutes...');
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

    await scraper.calculate(4000, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    console.log('   ✓ SUCCESS - Token still valid after 5 min\n');

    // Wait 10 more minutes (15 total)
    console.log('4️⃣ Test 3: After 15 minutes total');
    console.log('   ⏳ Waiting 10 more minutes...');
    await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));

    await scraper.calculate(3500, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    console.log('   ✓ SUCCESS - Token still valid after 15 min\n');

    // Wait 15 more minutes (30 total)
    console.log('5️⃣ Test 4: After 30 minutes total');
    console.log('   ⏳ Waiting 15 more minutes...');
    await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));

    await scraper.calculate(3000, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    console.log('   ✓ SUCCESS - Token still valid after 30 min\n');

    console.log('='.repeat(80));
    console.log('✅ Token is valid for at least 30 minutes!');
    console.log('='.repeat(80));

  } catch (error) {
    console.log(`\n❌ Token expired!`);
    console.log(`Error: ${error.message}`);

    if (error.message.includes('403') || error.message.includes('401')) {
      console.log('\n💡 Token likely expired - needs re-initialization');
    }
  } finally {
    await scraper.cleanup();
  }
}

// Quick test (just waits 2 minutes)
async function quickTest() {
  console.log('🧪 Quick Token Expiry Test (2 minutes)\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraper();

  try {
    console.log('\n1️⃣ Initialize and calculate immediately');
    await scraper.initializeSession();
    const result1 = await scraper.calculate(5000, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    console.log(`   ✓ Net: $${result1.totals.net_amount.toFixed(2)}\n`);

    console.log('2️⃣ Wait 2 minutes...');
    await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));

    console.log('3️⃣ Calculate again after 2 minutes');
    const result2 = await scraper.calculate(4000, 'Ontario',
      { year: '2025', month: '01', day: '31' });
    console.log(`   ✓ Net: $${result2.totals.net_amount.toFixed(2)}\n`);

    console.log('='.repeat(80));
    console.log('✅ Token valid for at least 2 minutes!');
    console.log('='.repeat(80));

  } catch (error) {
    console.log(`\n❌ FAILED: ${error.message}`);
  } finally {
    await scraper.cleanup();
  }
}

// Check if cookies have expiration info
async function checkCookieExpiry() {
  console.log('🧪 Checking Cookie Expiration Headers\n');
  console.log('='.repeat(80));

  const scraper = new HybridCRAScraper();

  try {
    await scraper.initializeSession();

    console.log('\n📋 Cookie Details:\n');
    scraper.cookies.forEach(cookie => {
      console.log(`Cookie: ${cookie.name}`);
      console.log(`  Value: ${cookie.value.substring(0, 50)}...`);
      console.log(`  Expires: ${cookie.expires ? new Date(cookie.expires * 1000) : 'Session'}`);
      console.log(`  Max-Age: ${cookie.maxAge || 'Not set'}`);
      console.log(`  Secure: ${cookie.secure}`);
      console.log(`  HttpOnly: ${cookie.httpOnly}`);
      console.log('');
    });

    const xsrfCookie = scraper.cookies.find(c => c.name === 'XSRF-TOKEN');

    if (xsrfCookie) {
      if (xsrfCookie.expires) {
        const expiryDate = new Date(xsrfCookie.expires * 1000);
        const now = new Date();
        const minutesUntilExpiry = Math.round((expiryDate - now) / 1000 / 60);

        console.log('='.repeat(80));
        console.log(`⏰ XSRF Token Expiry: ${expiryDate}`);
        console.log(`⏱️  Time until expiry: ${minutesUntilExpiry} minutes`);
        console.log('='.repeat(80));
      } else {
        console.log('='.repeat(80));
        console.log('⚠️  XSRF Token has no expiry (session cookie)');
        console.log('💡 Token likely expires when browser closes or after server-side timeout');
        console.log('='.repeat(80));
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await scraper.cleanup();
  }
}

// Run based on command line arg
const testType = process.argv[2] || 'check';

if (testType === 'full') {
  testTokenExpiry();
} else if (testType === 'quick') {
  quickTest();
} else {
  checkCookieExpiry();
}
