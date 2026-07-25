const replacePlaceholders = (htmlTemplate, data) => {
  let html = htmlTemplate;
  Object.keys(data).forEach(key => {
    const regexSingle = new RegExp(`\\{${key}\\}`, 'g');
    html = html.replace(regexSingle, data[key] || '');
    const upperKey = key.toUpperCase();
    const regexDouble = new RegExp(`\\{\\{${upperKey}\\}\\}`, 'g');
    html = html.replace(regexDouble, data[key] || '');
  });
  return html;
};

console.log('=== TEST 1: YTD Replacement ===');
const template1 = '${{GROSS_PAY_YTD}}';
const data1 = { GROSS_PAY_YTD: '2,700.00' };
const result1 = replacePlaceholders(template1, data1);
console.log('Template:', template1);
console.log('Data:', data1);
console.log('Result:', result1);
console.log('Expected: $2,700.00');
console.log('Match:', result1 === '$2,700.00' ? 'YES' : 'NO');

console.log('\n=== TEST 2: Multiple keys ===');
const template2 = '${{GROSS_PAY_YTD}}';
const data2 = {
  ytd_gross: '2,700.00',
  YTD_GROSS: '2,700.00',
  GROSS_PAY_YTD: '2,700.00'
};
const result2 = replacePlaceholders(template2, data2);
console.log('Template:', template2);
console.log('Data keys:', Object.keys(data2));
console.log('Result:', result2);
console.log('Expected: $2,700.00');
console.log('Match:', result2 === '$2,700.00' ? 'YES' : 'NO');

console.log('\n=== TEST 3: Step by step ===');
let html = '${{GROSS_PAY_YTD}}';
console.log('Starting HTML:', html);

// First iteration: ytd_gross
const key1 = 'ytd_gross';
const upperKey1 = key1.toUpperCase(); // YTD_GROSS
const regexDouble1 = new RegExp(`\\{\\{${upperKey1}\\}\\}`, 'g'); // /\{\{YTD_GROSS\}\}/g
console.log(`\nKey: ${key1}, UpperKey: ${upperKey1}, Regex: ${regexDouble1}`);
console.log('Matches:', html.match(regexDouble1));

//Second iteration: GROSS_PAY_YTD
const key2 = 'GROSS_PAY_YTD';
const upperKey2 = key2.toUpperCase(); // GROSS_PAY_YTD
const regexDouble2 = new RegExp(`\\{\\{${upperKey2}\\}\\}`, 'g'); // /\{\{GROSS_PAY_YTD\}\}/g
console.log(`\nKey: ${key2}, UpperKey: ${upperKey2}, Regex: ${regexDouble2}`);
console.log('Matches:', html.match(regexDouble2));
console.log('After replacement:', html.replace(regexDouble2, '2,700.00'));
