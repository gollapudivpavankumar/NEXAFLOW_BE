import mongoose from 'mongoose';
import PayslipTemplate from './models/PayslipTemplate.js';
import User from './models/User.js';
import Organization from './models/Organization.js';

const MONGODB_URI = 'mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr';

async function checkTemplates() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('CHECKING PAYSLIP TEMPLATES IN DATABASE');
    console.log('='.repeat(60));

    const templates = await PayslipTemplate.find({})
      .populate('createdBy', 'email')
      .populate('organizationId', 'name');

    console.log(`\nTotal templates found: ${templates.length}\n`);

    if (templates.length === 0) {
      console.log('❌ NO TEMPLATES FOUND IN DATABASE');
      console.log('   You need to upload templates through the UI');
    } else {
      templates.forEach((template, index) => {
        console.log(`Template ${index + 1}:`);
        console.log(`  ID: ${template._id}`);
        console.log(`  Name: ${template.name}`);
        console.log(`  Type: ${template.isGlobal ? 'Global (Super Admin)' : 'Custom (Org)'}`);
        console.log(`  Organization: ${template.organizationId ? template.organizationId.name : 'N/A (Global)'}`);
        console.log(`  Created By: ${template.createdBy ? template.createdBy.email : 'Unknown'}`);
        console.log(`  Is Default: ${template.isDefault ? 'Yes ⭐' : 'No'}`);
        console.log(`  Is Active: ${template.isActive ? 'Yes' : 'No'}`);
        console.log(`  HTML Content Length: ${template.htmlContent ? template.htmlContent.length : 0} characters`);
        console.log(`  Created: ${template.createdAt}`);
        console.log('-'.repeat(60));
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const globalTemplates = templates.filter(t => t.isGlobal);
    const customTemplates = templates.filter(t => !t.isGlobal);
    const activeTemplates = templates.filter(t => t.isActive);
    const defaultTemplates = templates.filter(t => t.isDefault);

    console.log(`Global Templates: ${globalTemplates.length}`);
    console.log(`Custom Templates: ${customTemplates.length}`);
    console.log(`Active Templates: ${activeTemplates.length}`);
    console.log(`Default Templates: ${defaultTemplates.length}`);

    if (templates.length === 0) {
      console.log('\n📝 ACTION REQUIRED:');
      console.log('   1. Login as OrgAdmin: info@sparklextechnologies.com');
      console.log('   2. Go to "Payslip Templates" page');
      console.log('   3. Click "Upload Custom Template"');
      console.log('   4. Upload your HTML template file');
    }

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTemplates();
