import mongoose from 'mongoose';
import PayslipTemplate from '../models/PayslipTemplate.js';

const fixJATemplateLogo = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr');
    console.log('Connected to MongoDB');

    // Find the JA template
    const jaTemplate = await PayslipTemplate.findOne({ name: 'JA' });

    if (!jaTemplate) {
      console.log('JA template not found in database');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('Found JA template:', jaTemplate.name);
    console.log('Current HTML length:', jaTemplate.htmlContent.length);

    let updatedHTML = jaTemplate.htmlContent;

    // First, find the malformed logo tag and extract what we need
    const logoPattern = /<img[^>]*src=["']{{COMPANY_LOGO}}["'][^>]*>/gi;
    const currentLogo = updatedHTML.match(logoPattern);

    if (currentLogo) {
      console.log('\nCurrent (possibly malformed) logo tag:');
      console.log(currentLogo[0]);

      // Replace the entire malformed logo tag with a clean, properly sized one
      const cleanLogoTag = `<img
                          src="{{COMPANY_LOGO}}"
                          style="max-width: 150px; max-height: 60px; filter: grayscale(100%); display: block; object-fit: contain;"
                          alt="Company Logo"
                        />`;

      // Replace any img tag with COMPANY_LOGO src (handles malformed cases)
      updatedHTML = updatedHTML.replace(
        /<img[\s\S]*?src=["']{{COMPANY_LOGO}}["'][\s\S]*?(?:>|\/\s*>|\/\s+style[^>]*>)/gi,
        cleanLogoTag
      );

      console.log('\n\nNew clean logo tag:');
      console.log(cleanLogoTag);

      // Update the template
      jaTemplate.htmlContent = updatedHTML;
      await jaTemplate.save();

      console.log('\n✅ JA template logo fixed successfully!');
      console.log('Logo specifications:');
      console.log('  - max-width: 150px');
      console.log('  - max-height: 60px');
      console.log('  - object-fit: contain (preserves aspect ratio)');
      console.log('  - filter: grayscale(100%)');
    } else {
      console.log('\n⚠️  No logo tag found with {{COMPANY_LOGO}} placeholder');
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing JA template logo:', error);
    process.exit(1);
  }
};

fixJATemplateLogo();
