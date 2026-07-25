const replacePlaceholders = (htmlTemplate, data) => {
  let html = htmlTemplate;
  console.log('Starting HTML:', html);

  Object.keys(data).forEach((key, index) => {
    console.log(`\n=== Iteration ${index + 1}: key="${key}" ===`);

    // Single brace replacement
    const regexSingle = new RegExp(`\\{${key}\\}`, 'g');
    console.log(`Single regex: ${regexSingle}`);
    const matchesSingle = html.match(regexSingle);
    console.log(`Matches single:`, matchesSingle);

    const beforeSingle = html;
    html = html.replace(regexSingle, data[key] || '');
    if (beforeSingle !== html) {
      console.log(`Changed by single: "${beforeSingle}" → "${html}"`);
    }

    // Double brace replacement
    const upperKey = key.toUpperCase();
    const regexDouble = new RegExp(`\\{\\{${upperKey}\\}\\}`, 'g');
    console.log(`Double regex: ${regexDouble}`);
    const matchesDouble = html.match(regexDouble);
    console.log(`Matches double:`, matchesDouble);

    const beforeDouble = html;
    html = html.replace(regexDouble, data[key] || '');
    if (beforeDouble !== html) {
      console.log(`Changed by double: "${beforeDouble}" → "${html}"`);
    }

    console.log(`HTML after iteration: "${html}"`);
  });

  console.log('\nFinal HTML:', html);
  return html;
};

const template = '${{GROSS_PAY_YTD}}';
const data = { GROSS_PAY_YTD: '2,700.00' };
const result = replacePlaceholders(template, data);
console.log('\n=== RESULT ===');
console.log('Expected: $2,700.00');
console.log('Got:     ', result);
console.log('Match:', result === '$2,700.00' ? 'YES ✓' : 'NO ✗');
