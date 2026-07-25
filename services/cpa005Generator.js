/**
 * CPA Standard 005 Bank File Generator
 * Generates CPA005 formatted files for Canadian payroll direct deposits.
 *
 * Record Types:
 *   A - Header Record (file-level metadata)
 *   C - Detail Record (one per employee payment)
 *   Z - Trailer Record (totals and counts)
 */

/**
 * Generate a complete CPA005 bank file.
 *
 * @param {Object} companyProfile - Company/originator information
 * @param {string} companyProfile.companyName - Legal company name
 * @param {string} companyProfile.bankTransitNumber - Return branch transit number
 * @param {string} companyProfile.bankInstitutionNumber - Return institution number
 * @param {string} companyProfile.bankAccountNumber - Return account number
 * @param {Array<Object>} employees - Array of employee payment records
 * @param {number} employees[].amount - Payment amount in dollars (will be converted to cents)
 * @param {string} employees[].bankTransit - Employee bank transit number
 * @param {string} employees[].financialInstitution - Employee bank institution number
 * @param {string} employees[].bankAccountNumber - Employee bank account number
 * @param {string} employees[].name - Employee full name
 * @param {string} [employees[].employeeId] - Optional employee identifier
 * @returns {string} Complete CPA005 file content
 */
export function generateCPA005(companyProfile, employees) {
  const lines = [];
  const fileDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileNum = String(Date.now()).slice(-4);

  // --- Header Record A ---
  // Fields: record type, file creation date, file creation number,
  //         originator short name (15 chars), originator ID (10 chars),
  //         return branch transit (5 digits), return account (12 chars)
  const originatorShortName = (companyProfile.companyName || 'COMPANY')
    .substring(0, 15)
    .padEnd(15);
  const originatorId = '0000000001';
  const returnTransit = (companyProfile.bankTransitNumber || '00000')
    .padStart(5, '0');
  const returnInstitution = (companyProfile.bankInstitutionNumber || '000')
    .padStart(3, '0');
  const returnAccount = (companyProfile.bankAccountNumber || '000000000000')
    .padStart(12, '0');
  const originatorName = (companyProfile.companyName || 'COMPANY')
    .substring(0, 30)
    .padEnd(30);

  lines.push(
    `A` +
    `${fileDate}` +
    `${fileNum.padStart(4, '0')}` +
    `${originatorShortName}` +
    `${originatorId}` +
    `${returnTransit}` +
    `${returnInstitution}` +
    `${returnAccount}` +
    `${originatorName}`
  );

  let totalAmount = 0;
  let recordCount = 0;

  // --- Detail Records C ---
  // Fields: record type, amount in cents (10 digits), file date,
  //         employee transit (5 digits), institution (3 digits),
  //         account (12 chars), employee name (30 chars)
  employees.forEach((emp) => {
    const amountCents = Math.round((emp.amount || 0) * 100);
    totalAmount += amountCents;
    recordCount++;

    const empTransit = (emp.bankTransit || '00000').padStart(5, '0');
    const empInstitution = (emp.financialInstitution || '000').padStart(3, '0');
    const empAccount = (emp.bankAccountNumber || '000000000000').padStart(12, '0');
    const empName = (emp.name || 'EMPLOYEE').substring(0, 30).padEnd(30);

    lines.push(
      `C` +
      `${String(amountCents).padStart(10, '0')}` +
      `${fileDate}` +
      `${empTransit}` +
      `${empInstitution}` +
      `${empAccount}` +
      `${empName}`
    );
  });

  // --- Trailer Record Z ---
  // Fields: record type, total amount in cents (14 digits),
  //         total record count (8 digits), file creation number (4 digits)
  lines.push(
    `Z` +
    `${String(totalAmount).padStart(14, '0')}` +
    `${String(recordCount).padStart(8, '0')}` +
    `${fileNum.padStart(4, '0')}`
  );

  return lines.join('\n');
}

/**
 * Generate a CSV export of employee payment data.
 *
 * @param {Object} companyProfile - Company information (unused in CSV but kept for consistency)
 * @param {Array<Object>} employees - Array of employee payment records
 * @returns {string} CSV file content with headers
 */
export function generateCSV(companyProfile, employees) {
  const lines = ['Transit,Institution,Account,Amount,Employee Name,Employee ID'];

  employees.forEach((emp) => {
    const transit = emp.bankTransit || '';
    const institution = emp.financialInstitution || '';
    const account = emp.bankAccountNumber || '';
    const amount = (emp.amount || 0).toFixed(2);
    const name = emp.name || '';
    const employeeId = emp.employeeId || '';

    // Quote name field to handle commas in employee names
    const safeName = name.includes(',') ? `"${name}"` : name;
    lines.push(`${transit},${institution},${account},${amount},${safeName},${employeeId}`);
  });

  return lines.join('\n');
}
