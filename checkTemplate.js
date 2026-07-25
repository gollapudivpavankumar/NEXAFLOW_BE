import mongoose from 'mongoose';
import PayslipTemplate from './models/PayslipTemplate.js';

mongoose.connect('mongodb+srv://pavankumarandroid_db_user:vKnOusM66BEV39j5@spxpr.zgd2rme.mongodb.net/?appName=spxpr')
  .then(async () => {
    const templates = await PayslipTemplate.find({ name: { $regex: 'JA', $options: 'i' } });
    if (templates.length > 0) {
      console.log('Found JA template:');
      console.log('Name:', templates[0].name);
      console.log('ID:', templates[0]._id);

      // Look for YTD and logo placeholders
      const html = templates[0].htmlContent;

      // Find YTD placeholders
      const ytdMatches = html.match(/\$\{+[^}]*YTD[^}]*\}+/gi) || [];
      const ytdMatches2 = html.match(/\{+[^}]*YTD[^}]*\}+/gi) || [];

      // Find logo placeholders
      const logoMatches = html.match(/\{+[^}]*logo[^}]*\}+/gi) || [];

      // Find address placeholders
      const addressMatches = html.match(/\{+[^}]*address[^}]*\}+/gi) || [];

      console.log('\nYTD placeholders with $:', ytdMatches.slice(0, 5));
      console.log('YTD placeholders without $:', ytdMatches2.slice(0, 5));
      console.log('Logo placeholders:', logoMatches.slice(0, 3));
      console.log('Address placeholders:', addressMatches.slice(0, 3));

      // Count braces
      if (ytdMatches.length > 0) {
        const sample = ytdMatches[0];
        const openBraces = (sample.match(/\{/g) || []).length;
        console.log('\nSample YTD placeholder:', sample);
        console.log('Number of opening braces:', openBraces);
      }
    } else {
      console.log('No JA template found. Listing all templates:');
      const allTemplates = await PayslipTemplate.find({});
      allTemplates.forEach(t => console.log(`- ${t.name} (ID: ${t._id})`));
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
