import mongoose from 'mongoose';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';

const seedEmployees = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr');
    console.log('Connected to MongoDB');

    // Find the SparklexTechnologies organization
    const organization = await Organization.findOne({ name: 'SparklexTechnologies' });

    if (!organization) {
      console.error('Organization "SparklexTechnologies" not found. Please run seed.js first.');
      process.exit(1);
    }

    console.log(`Found organization: ${organization.name} (${organization._id})`);

    // Clear existing employee data for this organization
    console.log('Clearing existing employee data...');
    const existingEmployees = await Employee.find({ organizationId: organization._id });
    const employeeUserIds = existingEmployees.map(emp => emp.userId).filter(Boolean);

    await User.deleteMany({ _id: { $in: employeeUserIds } });
    await Employee.deleteMany({ organizationId: organization._id });
    await LeaveBalance.deleteMany({ organizationId: organization._id });

    // Create Leave Types first
    console.log('Creating Leave Types...');
    await LeaveType.deleteMany({ organizationId: organization._id });

    const casualLeave = await LeaveType.create({
      organizationId: organization._id,
      name: 'Casual Leave',
      daysPerYear: 12,
      description: 'General purpose casual leave'
    });

    const sickLeave = await LeaveType.create({
      organizationId: organization._id,
      name: 'Sick Leave',
      daysPerYear: 10,
      description: 'Medical leave for illness'
    });

    const paidLeave = await LeaveType.create({
      organizationId: organization._id,
      name: 'Paid Leave',
      daysPerYear: 15,
      description: 'Annual paid leave'
    });

    console.log('Leave Types created successfully!');

    // Employee data with login credentials
    const employeeData = [
      {
        name: 'John Smith',
        email: 'john.smith@sparklextechnologies.com',
        password: 'Employee@123'
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah.johnson@sparklextechnologies.com',
        password: 'Employee@123'
      },
      {
        name: 'Michael Davis',
        email: 'michael.davis@sparklextechnologies.com',
        password: 'Employee@123'
      },
      {
        name: 'Emily Wilson',
        email: 'emily.wilson@sparklextechnologies.com',
        password: 'Employee@123'
      },
      {
        name: 'Robert Brown',
        email: 'robert.brown@sparklextechnologies.com',
        password: 'Employee@123'
      }
    ];

    console.log(`\nCreating ${employeeData.length} employees with login access...`);
    const createdEmployees = [];

    for (const empData of employeeData) {
      // Create Employee record first
      const employee = await Employee.create({
        organizationId: organization._id,
        name: empData.name,
        email: empData.email,
        isActive: true
      });

      // Create User record for login
      const user = await User.create({
        email: empData.email,
        password: empData.password,
        role: 'employee',
        organizationId: organization._id,
        employeeId: employee._id
      });

      // Update employee with userId
      employee.userId = user._id;
      await employee.save();

      // Create Leave Balances for each leave type
      await LeaveBalance.create({
        employeeId: employee._id,
        organizationId: organization._id,
        leaveTypeId: casualLeave._id,
        year: new Date().getFullYear(),
        totalDays: casualLeave.daysPerYear,
        usedDays: 0
      });

      await LeaveBalance.create({
        employeeId: employee._id,
        organizationId: organization._id,
        leaveTypeId: sickLeave._id,
        year: new Date().getFullYear(),
        totalDays: sickLeave.daysPerYear,
        usedDays: 0
      });

      await LeaveBalance.create({
        employeeId: employee._id,
        organizationId: organization._id,
        leaveTypeId: paidLeave._id,
        year: new Date().getFullYear(),
        totalDays: paidLeave.daysPerYear,
        usedDays: 0
      });

      createdEmployees.push({ employee, user });
      console.log(`✓ Created employee: ${empData.name} (${empData.email})`);
    }

    // Summary
    console.log('\n========================================');
    console.log('🎉 EMPLOYEE LOGINS CREATED SUCCESSFULLY!');
    console.log('========================================\n');

    console.log('Organization: SparklexTechnologies');
    console.log(`Organization ID: ${organization._id}\n`);

    console.log('📋 EMPLOYEE LOGIN CREDENTIALS:\n');
    console.log('-------------------------------------------');
    employeeData.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name}`);
      console.log(`   Email: ${emp.email}`);
      console.log(`   Password: ${emp.password}`);
      console.log('-------------------------------------------');
    });

    console.log('\n📊 LEAVE TYPES CONFIGURED:');
    console.log('-------------------------------------------');
    console.log(`1. ${casualLeave.name} - ${casualLeave.daysPerYear} days/year`);
    console.log(`2. ${sickLeave.name} - ${sickLeave.daysPerYear} days/year`);
    console.log(`3. ${paidLeave.name} - ${paidLeave.daysPerYear} days/year`);
    console.log('-------------------------------------------\n');

    console.log('✅ Each employee has been assigned:');
    console.log('   - Login credentials');
    console.log('   - Leave balances for all leave types');
    console.log('   - Full access to employee portal\n');

    console.log('🌐 LOGIN URL: http://localhost:5175/login');
    console.log('\n========================================\n');

    // Disconnect
    await mongoose.disconnect();
    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding employees:', error);
    process.exit(1);
  }
};

seedEmployees();
