// NEW FIXED VERSION
const replacePlaceholders = (htmlTemplate, data) => {
  let html = htmlTemplate;

  // FIRST PASS: Replace double braces {{KEY}} for all keys
  Object.keys(data).forEach(key => {
    const upperKey = key.toUpperCase();
    const regexDouble = new RegExp(`\\{\\{${upperKey}\\}\\}`, 'g');
    html = html.replace(regexDouble, data[key] || '');
  });

  // SECOND PASS: Replace single braces {key} for all keys
  Object.keys(data).forEach(key => {
    const regexSingle = new RegExp(`\\{${key}\\}`, 'g');
    html = html.replace(regexSingle, data[key] || '');
  });

  return html;
};

console.log('=== TEST: YTD with new fix ===');
const template = '${{GROSS_PAY_YTD}}';
const data = { GROSS_PAY_YTD: '2,700.00' };
const result = replacePlaceholders(template, data);
console.log('Template:', template);
console.log('Result:  ', result);
console.log('Expected: $2,700.00');
console.log('Match:', result === '$2,700.00' ? 'YES ✓✓✓' : 'NO ✗');

console.log('\n=== TEST: Logo ===');
const template2 = '{company_logo}';
const data2 = { company_logo: '<img src="logo.png" />' };
const result2 = replacePlaceholders(template2, data2);
console.log('Template:', template2);
console.log('Result:  ', result2);
console.log('Expected: <img src="logo.png" />');
console.log('Match:', result2 === '<img src="logo.png" />' ? 'YES ✓✓✓' : 'NO ✗');

console.log('\n=== TEST: Address ===');
const template3 = '{{COMPANY_ADDRESS_LINE1}}';
const data3 = { company_address_line1: '123 Main St' };
const result3 = replacePlaceholders(template3, data3);
console.log('Template:', template3);
console.log('Result:  ', result3);
console.log('Expected: 123 Main St');
console.log('Match:', result3 === '123 Main St' ? 'YES ✓✓✓' : 'NO ✗');
