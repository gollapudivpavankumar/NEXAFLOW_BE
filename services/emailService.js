import nodemailer from 'nodemailer';

// Create reusable transporter
const createTransporter = () => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email service not configured. Please set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS environment variables.');
    return null;
  }

  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Send job application notification to admin
export const sendApplicationNotificationToAdmin = async (application, job, organization) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('Email service not configured. Skipping notification.');
    return;
  }

  try {
    const mailOptions = {
      from: `"${organization.name}" <${process.env.EMAIL_USER}>`,
      to: organization.email,
      subject: `New Job Application: ${job.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">New Job Application Received</h2>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Job Position</h3>
            <p><strong>${job.title}</strong></p>
            <p>${job.department} - ${job.location}</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Applicant Details</h3>
            <p><strong>Name:</strong> ${application.fullName}</p>
            <p><strong>Email:</strong> ${application.email}</p>
            <p><strong>Phone:</strong> ${application.phone}</p>
            <p><strong>Location:</strong> ${application.location || 'Not specified'}</p>
            <p><strong>Experience:</strong> ${application.yearsOfExperience} years</p>
            ${application.currentPosition ? `<p><strong>Current Position:</strong> ${application.currentPosition}</p>` : ''}
            ${application.currentCompany ? `<p><strong>Current Company:</strong> ${application.currentCompany}</p>` : ''}
            ${application.expectedSalary ? `<p><strong>Expected Salary:</strong> $${application.expectedSalary.toLocaleString()}</p>` : ''}
            ${application.noticePeriod ? `<p><strong>Notice Period:</strong> ${application.noticePeriod}</p>` : ''}
          </div>

          ${application.coverLetter ? `
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Cover Letter</h3>
              <p style="white-space: pre-wrap;">${application.coverLetter}</p>
            </div>
          ` : ''}

          <div style="margin: 30px 0;">
            <p>Please log in to your admin panel to review the complete application and resume.</p>
          </div>

          <div style="background-color: #667eea; color: white; padding: 15px; border-radius: 8px; text-align: center;">
            <p style="margin: 0;">Application submitted on ${new Date(application.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Application notification email sent successfully');
  } catch (error) {
    console.error('Error sending application notification email:', error);
  }
};

// Send confirmation email to applicant
export const sendApplicationConfirmationToApplicant = async (application, job, organization) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('Email service not configured. Skipping notification.');
    return;
  }

  try {
    const mailOptions = {
      from: `"${organization.name}" <${process.env.EMAIL_USER}>`,
      to: application.email,
      subject: `Application Received: ${job.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; padding: 30px 0;">
            ${organization.logo ? `<img src="${organization.logo}" alt="${organization.name}" style="max-height: 60px;" />` : ''}
            <h1 style="color: #667eea; margin: 20px 0;">Thank You for Your Application!</h1>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>Dear ${application.fullName},</p>
            <p>Thank you for your interest in the <strong>${job.title}</strong> position at ${organization.name}.</p>
            <p>We have received your application and our team will review it carefully. If your qualifications match our requirements, we will contact you within 3-5 business days to discuss the next steps.</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Position Details</h3>
            <p><strong>Job Title:</strong> ${job.title}</p>
            <p><strong>Department:</strong> ${job.department}</p>
            <p><strong>Location:</strong> ${job.location}</p>
            <p><strong>Employment Type:</strong> ${job.employmentType}</p>
          </div>

          <div style="background-color: #e8eaf6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #667eea;">What Happens Next?</h3>
            <ol style="padding-left: 20px;">
              <li style="margin-bottom: 10px;">Our recruitment team will review your application</li>
              <li style="margin-bottom: 10px;">Shortlisted candidates will be contacted for an interview</li>
              <li style="margin-bottom: 10px;">Successful candidates will proceed to the next hiring stages</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p>If you have any questions, please don't hesitate to reach out to us at:</p>
            <p><strong>${organization.email}</strong></p>
            ${organization.phone ? `<p><strong>${organization.phone}</strong></p>` : ''}
          </div>

          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; margin-top: 30px;">
            <p style="margin: 0; font-size: 12px; color: #666;">
              This is an automated confirmation email. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent to applicant successfully');
  } catch (error) {
    console.error('Error sending confirmation email to applicant:', error);
  }
};

// Send status update notification to applicant
export const sendApplicationStatusUpdate = async (application, job, organization, newStatus) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('Email service not configured. Skipping notification.');
    return;
  }

  const statusMessages = {
    reviewing: {
      subject: 'Application Under Review',
      title: 'Your Application is Being Reviewed',
      message: 'Good news! Your application is currently being reviewed by our hiring team. We will update you on the next steps soon.'
    },
    shortlisted: {
      subject: 'You Have Been Shortlisted!',
      title: 'Congratulations! You Have Been Shortlisted',
      message: 'We are pleased to inform you that you have been shortlisted for the next stage. Our team will contact you shortly to schedule an interview.'
    },
    interviewed: {
      subject: 'Interview Scheduled',
      title: 'Your Interview Has Been Scheduled',
      message: 'Thank you for your time during the interview. We are currently evaluating all candidates and will get back to you with our decision soon.'
    },
    offered: {
      subject: 'Job Offer',
      title: 'Congratulations! We Would Like to Offer You the Position',
      message: 'We are delighted to extend an offer for the position. Our team will reach out to you with the offer details and next steps.'
    },
    rejected: {
      subject: 'Application Status Update',
      title: 'Thank You for Your Interest',
      message: 'Thank you for your interest in this position. While we were impressed with your qualifications, we have decided to move forward with other candidates whose experience more closely matches our current needs. We encourage you to apply for future opportunities at our organization.'
    }
  };

  const statusInfo = statusMessages[newStatus] || {
    subject: 'Application Status Update',
    title: 'Your Application Status Has Been Updated',
    message: `Your application status has been updated to: ${newStatus}`
  };

  try {
    const mailOptions = {
      from: `"${organization.name}" <${process.env.EMAIL_USER}>`,
      to: application.email,
      subject: `${statusInfo.subject} - ${job.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; padding: 30px 0;">
            ${organization.logo ? `<img src="${organization.logo}" alt="${organization.name}" style="max-height: 60px;" />` : ''}
            <h1 style="color: #667eea; margin: 20px 0;">${statusInfo.title}</h1>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p>Dear ${application.fullName},</p>
            <p>${statusInfo.message}</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Position Details</h3>
            <p><strong>Job Title:</strong> ${job.title}</p>
            <p><strong>Department:</strong> ${job.department}</p>
            <p><strong>Status:</strong> <span style="color: #667eea; font-weight: bold;">${newStatus.toUpperCase()}</span></p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p>If you have any questions, please contact us at:</p>
            <p><strong>${organization.email}</strong></p>
            ${organization.phone ? `<p><strong>${organization.phone}</strong></p>` : ''}
          </div>

          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; margin-top: 30px;">
            <p style="margin: 0; font-size: 12px; color: #666;">
              Best regards,<br/>
              ${organization.name} Recruitment Team
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Status update email sent to applicant successfully');
  } catch (error) {
    console.error('Error sending status update email:', error);
  }
};

export default {
  sendApplicationNotificationToAdmin,
  sendApplicationConfirmationToApplicant,
  sendApplicationStatusUpdate
};
