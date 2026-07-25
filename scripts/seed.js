import mongoose from 'mongoose';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import SalaryMasterTable from '../models/SalaryMasterTable.js';

// Salary data for SparklexTechnologies
const salaryData = [
  { gross: 3220.00, net: 2645.32, tax: 574.68, fTax: 347.63, cpp: 174.24, ei: 52.81, eCpp: 174.24, eEi: 73.93, remittance: 825, beforeJune: false, afterJuly: true },
  { gross: 3220.00, net: 2630.06, tax: 589.94, fTax: 362.89, cpp: 174.24, ei: 52.81, eCpp: 174.24, eEi: 73.93, remittance: 838.11, beforeJune: true, afterJuly: false },
  { gross: 3348.80, net: 2724.17, tax: 624.63, fTax: 387.81, cpp: 181.9, ei: 54.92, eCpp: 181.9, eEi: 76.89, remittance: 883.42, beforeJune: true, afterJuly: false },
  { gross: 3348.80, net: 2740.63, tax: 608.17, fTax: 371.35, cpp: 181.9, ei: 54.92, eCpp: 181.9, eEi: 76.89, remittance: 866.96, beforeJune: false, afterJuly: true },
  { gross: 3000.00, net: 2478.97, tax: 521.03, fTax: 310.68, cpp: 161.15, ei: 49.20, eCpp: 161.15, eEi: 68.88, remittance: 751.06, beforeJune: true, afterJuly: false },
  { gross: 3000.00, net: 2478.97, tax: 521.03, fTax: 297.45, cpp: 161.15, ei: 49.20, eCpp: 161.15, eEi: 68.88, remittance: 737.83, beforeJune: false, afterJuly: true },
  { gross: 2777.23, net: 2314.38, tax: 462.85, fTax: 269.41, cpp: 147.89, ei: 45.55, eCpp: 147.89, eEi: 63.77, remittance: 674.51, beforeJune: true, afterJuly: false },
  { gross: 2800.00, net: 2331.2, tax: 468.80, fTax: 273.63, cpp: 149.25, ei: 45.92, eCpp: 149.25, eEi: 64.29, remittance: 682.34, beforeJune: true, afterJuly: false },
  { gross: 2800.00, net: 2331.2, tax: 468.80, fTax: 262.24, cpp: 149.25, ei: 45.92, eCpp: 149.25, eEi: 64.29, remittance: 670.95, beforeJune: false, afterJuly: true },
  { gross: 784.00, net: 741.85, tax: 42.15, fTax: 0.00, cpp: 29.29, ei: 12.86, eCpp: 29.29, eEi: 18.00, remittance: 89.44, beforeJune: true, afterJuly: false },
  { gross: 4000.00, net: 3205.29, tax: 794.71, fTax: 508.46, cpp: 220.65, ei: 65.60, eCpp: 220.65, eEi: 91.84, remittance: 1107.20, beforeJune: true, afterJuly: false },
  { gross: 4000.00, net: 3227.76, tax: 772.24, fTax: 485.99, cpp: 220.65, ei: 65.60, eCpp: 220.65, eEi: 91.84, remittance: 1084.73, beforeJune: false, afterJuly: true },
  { gross: 4160.00, net: 3311.00, tax: 849.00, fTax: 550.61, cpp: 230.17, ei: 68.22, eCpp: 230.17, eEi: 95.51, remittance: 1174.68, beforeJune: true, afterJuly: false },
  { gross: 6678.00, net: 4932.57, tax: 1745.43, fTax: 1255.92, cpp: 379.99, ei: 109.52, eCpp: 379.99, eEi: 153.33, remittance: 2278.75, beforeJune: true, afterJuly: false },
  { gross: 6678.00, net: 5072.77, tax: 1605.23, fTax: 1115.72, cpp: 379.99, ei: 109.52, eCpp: 379.99, eEi: 153.33, remittance: 2138.55, beforeJune: false, afterJuly: true },
  { gross: 6945.12, net: 5098.76, tax: 1846.36, fTax: 1336.58, cpp: 395.88, ei: 113.90, eCpp: 395.88, eEi: 159.46, remittance: 2401.70, beforeJune: true, afterJuly: false },
  { gross: 6360.00, net: 4734.73, tax: 1625.27, fTax: 1159.90, cpp: 361.07, ei: 104.30, eCpp: 361.07, eEi: 146.02, remittance: 2132.36, beforeJune: true, afterJuly: false },
  { gross: 6360.00, net: 4874.93, tax: 1485.07, fTax: 1019.70, cpp: 361.07, ei: 104.30, eCpp: 361.07, eEi: 146.02, remittance: 1992.16, beforeJune: false, afterJuly: true },
  { gross: 6784.00, net: 4998.52, tax: 1785.48, fTax: 1287.93, cpp: 386.29, ei: 111.26, eCpp: 386.29, eEi: 155.76, remittance: 2327.53, beforeJune: true, afterJuly: false },
  { gross: 537.60, net: 514.15, tax: 23.45, fTax: 0.00, cpp: 14.63, ei: 8.82, eCpp: 14.63, eEi: 12.35, remittance: 50.43, beforeJune: true, afterJuly: false },
  { gross: 3360.00, net: 2732.45, tax: 627.55, fTax: 389.88, cpp: 182.57, ei: 55.10, eCpp: 182.57, eEi: 77.14, remittance: 887.26, beforeJune: true, afterJuly: false },
  { gross: 3360.00, net: 2732.45, tax: 627.55, fTax: 373.33, cpp: 182.57, ei: 55.10, eCpp: 182.57, eEi: 77.14, remittance: 870.71, beforeJune: false, afterJuly: true },
  { gross: 289.90, net: 285.05, tax: 4.85, fTax: 0.00, cpp: 0.00, ei: 4.48, eCpp: 0.00, eEi: 9.33, remittance: 13.81, beforeJune: true, afterJuly: false },
  { gross: 6250.00, net: 4686.41, tax: 1563.59, fTax: 1106.57, cpp: 354.52, ei: 102.50, eCpp: 354.52, eEi: 143.50, remittance: 2061.61, beforeJune: true, afterJuly: false },
  { gross: 6250.00, net: 4686.41, tax: 1563.59, fTax: 1077.18, cpp: 354.52, ei: 102.50, eCpp: 354.52, eEi: 143.50, remittance: 2032.22, beforeJune: false, afterJuly: true },
  { gross: 6111.60, net: 4599.14, tax: 1512.46, fTax: 1065.94, cpp: 346.29, ei: 100.23, eCpp: 346.29, eEi: 140.32, remittance: 1999.07, beforeJune: true, afterJuly: false },
  { gross: 6500.00, net: 4844.05, tax: 1655.95, fTax: 1179.95, cpp: 369.40, ei: 106.60, eCpp: 369.40, eEi: 149.24, remittance: 2174.59, beforeJune: true, afterJuly: false },
  { gross: 5556.00, net: 4287.05, tax: 1268.95, fTax: 864.60, cpp: 313.23, ei: 91.12, eCpp: 313.23, eEi: 127.57, remittance: 1709.75, beforeJune: false, afterJuly: true },
  { gross: 3800.00, net: 3078.15, tax: 721.85, fTax: 471.41, cpp: 208.75, ei: 62.32, eCpp: 208.75, eEi: 87.25, remittance: 1038.48, beforeJune: true, afterJuly: false },
  { gross: 3800.00, net: 3078.15, tax: 721.85, fTax: 450.78, cpp: 208.75, ei: 62.32, eCpp: 208.75, eEi: 87.25, remittance: 1017.85, beforeJune: false, afterJuly: true },
  { gross: 2700.00, net: 2257.32, tax: 442.68, fTax: 255.10, cpp: 143.30, ei: 44.28, eCpp: 143.30, eEi: 61.99, remittance: 647.97, beforeJune: true, afterJuly: false },
  { gross: 3952.00, net: 3169.83, tax: 782.17, fTax: 499.57, cpp: 217.79, ei: 64.81, eCpp: 217.79, eEi: 90.73, remittance: 1090.69, beforeJune: true, afterJuly: false },
  { gross: 2940.00, net: 2434.64, tax: 505.36, fTax: 299.56, cpp: 157.58, ei: 48.22, eCpp: 157.58, eEi: 67.51, remittance: 730.45, beforeJune: true, afterJuly: false },
  { gross: 2940.00, net: 2447.31, tax: 492.69, fTax: 286.89, cpp: 157.58, ei: 48.22, eCpp: 157.58, eEi: 67.51, remittance: 717.78, beforeJune: false, afterJuly: true },
  { gross: 2973.00, net: 2337.35, tax: 635.65, fTax: 261.01, cpp: 148.83, ei: 45.81, eCpp: 148.83, eEi: 64.13, remittance: 668.61, beforeJune: false, afterJuly: true },
  { gross: 3057.60, net: 2519.74, tax: 537.86, fTax: 323.15, cpp: 164.57, ei: 50.14, eCpp: 164.57, eEi: 70.20, remittance: 772.63, beforeJune: true, afterJuly: false },
  { gross: 3500.00, net: 2835.88, tax: 664.12, fTax: 415.82, cpp: 190.90, ei: 57.40, eCpp: 190.90, eEi: 80.36, remittance: 935.38, beforeJune: true, afterJuly: false },
  { gross: 3500.00, net: 2853.73, tax: 646.27, fTax: 397.97, cpp: 190.90, ei: 57.40, eCpp: 190.90, eEi: 80.36, remittance: 917.53, beforeJune: false, afterJuly: true },
  { gross: 3640.00, net: 2939.31, tax: 700.69, fTax: 441.76, cpp: 199.23, ei: 59.70, eCpp: 199.23, eEi: 83.58, remittance: 983.50, beforeJune: true, afterJuly: false },
  { gross: 5633.33, net: 4306.99, tax: 1326.34, fTax: 916.12, cpp: 317.83, ei: 92.39, eCpp: 317.83, eEi: 129.35, remittance: 1773.52, beforeJune: true, afterJuly: false },
  { gross: 5633.33, net: 4336.54, tax: 1296.79, fTax: 886.57, cpp: 317.83, ei: 92.39, eCpp: 317.83, eEi: 129.35, remittance: 1743.97, beforeJune: false, afterJuly: true },
  { gross: 2992.50, net: 2473.43, tax: 519.07, fTax: 309.29, cpp: 160.70, ei: 49.08, eCpp: 160.70, eEi: 68.71, remittance: 748.48, beforeJune: true, afterJuly: false },
  { gross: 5859.00, net: 4451.53, tax: 1407.47, fTax: 980.12, cpp: 331.26, ei: 96.09, eCpp: 331.26, eEi: 134.53, remittance: 1873.26, beforeJune: true, afterJuly: false },
  { gross: 5928.00, net: 4495.73, tax: 1432.27, fTax: 999.69, cpp: 335.36, ei: 97.22, eCpp: 335.36, eEi: 136.11, remittance: 1903.74, beforeJune: true, afterJuly: false },
  { gross: 5700.00, net: 4349.70, tax: 1350.30, fTax: 935.02, cpp: 321.80, ei: 93.48, eCpp: 321.80, eEi: 130.87, remittance: 1802.97, beforeJune: true, afterJuly: false },
  { gross: 5700.00, net: 4349.70, tax: 1350.30, fTax: 905.52, cpp: 321.80, ei: 93.48, eCpp: 321.80, eEi: 130.87, remittance: 1773.47, beforeJune: false, afterJuly: true },
  { gross: 4750.00, net: 3764.05, tax: 985.95, fTax: 642.78, cpp: 265.27, ei: 77.90, eCpp: 265.27, eEi: 109.06, remittance: 1360.28, beforeJune: false, afterJuly: true },
  { gross: 4206.22, net: 3345.14, tax: 861.08, fTax: 559.17, cpp: 232.92, ei: 68.98, eCpp: 232.92, eEi: 96.57, remittance: 1190.56, beforeJune: true, afterJuly: false },
  { gross: 5633.33, net: 4306.99, tax: 1326.34, fTax: 916.12, cpp: 317.83, ei: 92.39, eCpp: 317.83, eEi: 129.35, remittance: 1773.52, beforeJune: true, afterJuly: false },
  { gross: 5633.33, net: 4306.99, tax: 1326.34, fTax: 886.57, cpp: 317.83, ei: 92.39, eCpp: 317.83, eEi: 129.35, remittance: 1743.97, beforeJune: false, afterJuly: true },
  { gross: 1890.00, net: 1687.98, tax: 202.02, fTax: 75.92, cpp: 95.10, ei: 31.00, eCpp: 95.10, eEi: 43.40, remittance: 340.52, beforeJune: false, afterJuly: true }
];

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr');
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await Organization.deleteMany({});
    await User.deleteMany({});
    await SalaryMasterTable.deleteMany({});

    // Create SuperAdmin user
    console.log('Creating SuperAdmin user...');
    const superAdmin = await User.create({
      email: 'admin@payroll-saas.com',
      password: 'Admin@123',
      role: 'superadmin'
    });
    console.log('SuperAdmin created:', superAdmin.email);

    // Create SparklexTechnologies organization
    console.log('Creating SparklexTechnologies organization...');
    const organization = await Organization.create({
      name: 'SparklexTechnologies',
      email: 'info@sparklextechnologies.com'
    });
    console.log('Organization created:', organization.name);

    // Create OrgAdmin for SparklexTechnologies
    console.log('Creating OrgAdmin for SparklexTechnologies...');
    const orgAdmin = await User.create({
      email: 'info@sparklextechnologies.com',
      password: 'Sparklex773!',
      role: 'orgadmin',
      organizationId: organization._id
    });
    console.log('OrgAdmin created:', orgAdmin.email);

    // Create salary master table records
    console.log(`Creating ${salaryData.length} salary master table records...`);
    const salaryRecords = await SalaryMasterTable.insertMany(
      salaryData.map(salary => ({
        organizationId: organization._id,
        year: 2025,
        ...salary
      }))
    );
    console.log(`${salaryRecords.length} salary records created successfully!`);

    // Summary
    console.log('\n=== Seed Summary ===');
    console.log('SuperAdmin:');
    console.log('  Email:', superAdmin.email);
    console.log('  Password: Admin@123');
    console.log('\nOrganization:', organization.name);
    console.log('OrgAdmin:');
    console.log('  Email:', orgAdmin.email);
    console.log('  Password: Sparklex773!');
    console.log(`\nSalary Master Records: ${salaryRecords.length}`);
    console.log('\n===================\n');

    // Disconnect
    await mongoose.disconnect();
    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
