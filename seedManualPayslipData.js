import connectDB from './config/db.js';
import CompanyProfile from './models/CompanyProfile.js';
import ManualPayslipEmployee from './models/ManualPayslipEmployee.js';

const seedData = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Actual IDs from your database
    const organizationId = '6903ddd5b2f8717e1dfa7c7a'; // SparklexTechnologies
    const userId = '6903ddd5b2f8717e1dfa7c78'; // admin@payroll-saas.com

    console.log('\nSeeding Nexglobe Technologies company profile...');

    // Check if profile already exists
    const existingProfile = await CompanyProfile.findOne({
      organizationId,
      companyName: 'Nexglobe Technologies'
    });

    let companyProfile;

    if (existingProfile) {
      console.log('✓ Company profile already exists, updating...');
      existingProfile.companyEmail = 'info@nexglobetechnologies.com';
      existingProfile.companyAddress = '73 Water St North, Suite 300 Cambridge, Ontario N1R 7L6, Canada';
      existingProfile.companyPhone = '+1 (418) 557-3838';
      existingProfile.companyLogo = 'https://nexglobetechnologies.com/wp-content/uploads/2024/01/Screenshot_12-removebg-preview-2.png';
      existingProfile.bankAccountName = 'Nexglobe Technologies';
      existingProfile.bankAccountNumber = '12348224'; // Unmasked version of *****8224
      existingProfile.bankTransitNumber = '12351'; // Unmasked version of ***351
      existingProfile.isDefault = true;
      existingProfile.profileName = 'Nexglobe Technologies - Main';
      await existingProfile.save();
      companyProfile = existingProfile;
    } else {
      companyProfile = await CompanyProfile.create({
        organizationId,
        profileName: 'Nexglobe Technologies - Main',
        companyName: 'Nexglobe Technologies',
        companyEmail: 'info@nexglobetechnologies.com',
        companyAddress: '73 Water St North, Suite 300 Cambridge, Ontario N1R 7L6, Canada',
        companyPhone: '+1 (418) 557-3838',
        companyLogo: 'https://nexglobetechnologies.com/wp-content/uploads/2024/01/Screenshot_12-removebg-preview-2.png',
        bankAccountName: 'Nexglobe Technologies',
        bankAccountNumber: '12348224', // Unmasked version of *****8224
        bankTransitNumber: '12351', // Unmasked version of ***351
        isDefault: true,
        createdBy: userId
      });
      console.log('✓ Company profile created successfully');
    }

    console.log('\nCompany Profile Details:');
    console.log('- Name:', companyProfile.companyName);
    console.log('- Email:', companyProfile.companyEmail);
    console.log('- Phone:', companyProfile.companyPhone);
    console.log('- Address:', companyProfile.companyAddress);
    console.log('- Logo:', companyProfile.companyLogo);
    console.log('- Bank Account:', companyProfile.bankAccountName);
    console.log('- Account Number:', companyProfile.bankAccountNumber);
    console.log('- Transit Number:', companyProfile.bankTransitNumber);

    console.log('\nSeeding sample employee...');

    // Check if employee already exists
    const existingEmployee = await ManualPayslipEmployee.findOne({
      companyProfileId: companyProfile._id,
      employeeName: 'SHIVARAMA KRISHNA SANGEKARI'
    });

    let employee;

    if (existingEmployee) {
      console.log('✓ Employee already exists, updating...');
      existingEmployee.employeeAddress = '5868 Ladyburn Crescent Mississauga, ON L5M 4V2';
      existingEmployee.province = 'Ontario';
      existingEmployee.isDefault = true;
      await existingEmployee.save();
      employee = existingEmployee;
    } else {
      employee = await ManualPayslipEmployee.create({
        companyProfileId: companyProfile._id,
        organizationId,
        employeeName: 'SHIVARAMA KRISHNA SANGEKARI',
        employeeAddress: '5868 Ladyburn Crescent Mississauga, ON L5M 4V2',
        province: 'Ontario',
        isDefault: true,
        createdBy: userId
      });
      console.log('✓ Employee created successfully');
    }

    console.log('\nEmployee Details:');
    console.log('- Name:', employee.employeeName);
    console.log('- Address:', employee.employeeAddress);
    console.log('- Province:', employee.province);

    console.log('\n✅ Seeding completed successfully!');
    console.log('\nYou can now use these profiles in the Manual Payslip Generator.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
};

seedData();
