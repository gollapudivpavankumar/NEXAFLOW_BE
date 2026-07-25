import connectDB from './config/db.js';
import User from './models/User.js';
import Organization from './models/Organization.js';

const findIds = async () => {
  try {
    await connectDB();
    console.log('');

    // Find first organization
    const org = await Organization.findOne();

    // Find first user (preferably admin, but any user will work)
    let user = await User.findOne({ role: { $in: ['orgAdmin', 'superAdmin'] } });

    // If no admin found, find any user
    if (!user) {
      user = await User.findOne();
    }

    if (!org) {
      console.log('❌ No organization found in database');
      console.log('Please create an organization first through the app');
    } else {
      console.log('Organization Details:');
      console.log('- ID:', org._id.toString());
      console.log('- Name:', org.name);
      console.log('- Email:', org.email);
    }

    console.log('');

    if (!user) {
      console.log('❌ No admin user found in database');
      console.log('Please create a user first through the app');
    } else {
      console.log('User Details:');
      console.log('- ID:', user._id.toString());
      console.log('- Name:', user.name);
      console.log('- Email:', user.email);
      console.log('- Role:', user.role);
      console.log('- Organization:', user.organizationId);
    }

    console.log('\n✓ Copy these IDs to seedManualPayslipData.js\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

findIds();
