import mongoose from 'mongoose';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import Organization from '../models/Organization.js';
import LeaveType from '../models/LeaveType.js';
import LeaveBalance from '../models/LeaveBalance.js';

const createTestEmployee = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr');
    console.log('Connected to MongoDB');

    // Get SparklexTechnologies organization
    const org = await Organization.findOne({ name: 'SparklexTechnologies' });
    if (!org) {
      console.error('Organization not found');
      process.exit(1);
    }

    console.log('Organization found:', org.name);

    // Create employee record
    const employee = await Employee.create({
      organizationId: org._id,
      name: 'John Doe',
      email: 'john.doe@sparklextechnologies.com',
      isActive: true,
      notes: 'Test employee account'
    });

    console.log('Employee created:', employee.name);

    // Create user account for employee
    const user = await User.create({
      email: 'john.doe@sparklextechnologies.com',
      password: 'Employee123!',
      role: 'employee',
      organizationId: org._id,
      employeeId: employee._id
    });

    console.log('User account created');

    // Link user to employee
    employee.userId = user._id;
    await employee.save();

    // Create default leave types if they don't exist
    const leaveTypes = [
      { name: 'Sick Leave', daysPerYear: 10, description: 'For illness and medical appointments' },
      { name: 'Vacation', daysPerYear: 15, description: 'Annual vacation leave' },
      { name: 'Personal Leave', daysPerYear: 5, description: 'Personal matters' }
    ];

    for (const ltData of leaveTypes) {
      let leaveType = await LeaveType.findOne({ organizationId: org._id, name: ltData.name });

      if (!leaveType) {
        leaveType = await LeaveType.create({
          organizationId: org._id,
          ...ltData
        });
        console.log('Created leave type:', leaveType.name);
      }

      // Create leave balance for employee
      await LeaveBalance.create({
        employeeId: employee._id,
        organizationId: org._id,
        leaveTypeId: leaveType._id,
        year: new Date().getFullYear(),
        totalDays: ltData.daysPerYear,
        usedDays: 0
      });
    }

    console.log('Leave balances initialized');

    console.log('\n✅ Test employee created successfully!');
    console.log('\nEmployee Login Credentials:');
    console.log('Email: john.doe@sparklextechnologies.com');
    console.log('Password: Employee123!');
    console.log('\nYou can now login as an employee to test the system.');

  } catch (error) {
    console.error('Error creating test employee:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

createTestEmployee();
