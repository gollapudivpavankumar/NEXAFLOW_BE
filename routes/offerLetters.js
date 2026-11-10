import express from 'express';
import puppeteer from 'puppeteer';
import OfferLetter from '../models/OfferLetter.js';
import OfferLetterTemplate from '../models/OfferLetterTemplate.js';
import Employee from '../models/Employee.js';
import Organization from '../models/Organization.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Helper function to create transporter based on org SMTP settings
const createOrgTransporter = (org) => {
  // If org has SMTP settings, use them
  if (org.smtpHost && org.smtpUser && org.smtpPassword) {
    return nodemailer.createTransport({
      host: org.smtpHost,
      port: org.smtpPort || 587,
      secure: org.smtpSecure || false,
      auth: {
        user: org.smtpUser,
        pass: org.smtpPassword
      }
    });
  }

  // Fallback to global SMTP if org hasn't configured
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    }
  });
};

// Replace placeholders in template
const replacePlaceholders = (htmlTemplate, data) => {
  let html = htmlTemplate;

  Object.keys(data).forEach(key => {
    // Support lowercase single brace: {key}
    const regexSingle = new RegExp(`\\{${key}\\}`, 'g');
    html = html.replace(regexSingle, data[key] || '');

    // Support uppercase double brace: {{KEY}}
    const upperKey = key.toUpperCase();
    const regexDouble = new RegExp(`\\{\\{${upperKey}\\}\\}`, 'g');
    html = html.replace(regexDouble, data[key] || '');
  });

  return html;
};

// @route   POST /api/offer-letters/:organizationId/send
// @desc    Create and send offer letter to employee
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/send', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { employeeId, templateId, position, salary, joiningDate, additionalData } = req.body;

    // Validate required fields
    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required' });
    }

    if (!position || position.trim().length === 0) {
      return res.status(400).json({ message: 'Position is required' });
    }

    if (!salary || isNaN(salary) || salary <= 0) {
      return res.status(400).json({ message: 'Valid salary is required' });
    }

    if (!joiningDate || joiningDate.trim().length === 0) {
      return res.status(400).json({ message: 'Joining date is required' });
    }

    // Get employee
    const employee = await Employee.findOne({ _id: employeeId, organizationId })
      .populate('organizationId');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (!employee.email) {
      return res.status(400).json({ message: 'Employee does not have an email address' });
    }

    const org = employee.organizationId;

    // Get template
    let templateHTML;
    let selectedTemplate;

    if (templateId) {
      selectedTemplate = await OfferLetterTemplate.findById(templateId);
      if (!selectedTemplate) {
        return res.status(404).json({ message: 'Template not found' });
      }
    } else {
      // Find default template
      selectedTemplate = await OfferLetterTemplate.findOne({
        $or: [
          { organizationId, isDefault: true, isActive: true },
          { isGlobal: true, isDefault: true, isActive: true }
        ]
      }).sort({ organizationId: -1 });

      if (!selectedTemplate) {
        return res.status(400).json({ message: 'No template found. Please select a template or set a default template.' });
      }
    }

    templateHTML = selectedTemplate.htmlContent;

    // Prepare data for placeholder replacement
    const data = {
      employee_name: employee.name,
      employee_email: employee.email,
      employee_position: position,
      position: position,
      salary: salary,
      joining_date: joiningDate,
      company_name: org.name,
      company_address_line1: org.addressLine1 || org.email,
      company_address_line2: org.addressLine2 || '',
      company_phone: org.phone || '',
      company_logo: org.logo || '',
      date: new Date().toLocaleDateString(),
      ...additionalData
    };

    // Replace placeholders
    const filledHTML = replacePlaceholders(templateHTML, data);

    // Create offer letter record
    const offerLetter = await OfferLetter.create({
      employeeId: employee._id,
      organizationId,
      templateId: selectedTemplate._id,
      employeeName: employee.name,
      employeeEmail: employee.email,
      position,
      salary,
      joiningDate,
      htmlContent: filledHTML,
      sentBy: req.user._id,
      additionalData: additionalData || {}
    });

    // Send email with signature link
    const signatureLink = `${process.env.FRONTEND_URL || 'http://localhost:5175'}/sign-offer-letter/${offerLetter.signatureToken}`;

    try {
      // Create transporter with org SMTP settings
      const transporter = createOrgTransporter(org);

      // Determine from email and name
      const fromEmail = org.smtpFromEmail || org.email || process.env.EMAIL_USER || 'noreply@company.com';
      const fromName = org.smtpFromName || org.name;

      await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: employee.email,
        subject: `Offer Letter - ${position} at ${org.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Congratulations ${employee.name}!</h2>
            <p>You have received an offer letter for the position of <strong>${position}</strong> at <strong>${org.name}</strong>.</p>
            <p>Please click the button below to view and sign your offer letter:</p>
            <div style="margin: 30px 0;">
              <a href="${signatureLink}" style="background-color: #1890ff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">
                View & Sign Offer Letter
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              This link will expire on ${offerLetter.expiryDate.toLocaleDateString()}.
            </p>
            <p style="color: #666; font-size: 14px;">
              If you have any questions, please contact us at ${org.email}
            </p>
          </div>
        `
      });

      console.log('Offer letter email sent to:', employee.email);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails - offer letter is still created
    }

    res.status(201).json({
      message: 'Offer letter sent successfully',
      offerLetter: {
        id: offerLetter._id,
        employeeName: offerLetter.employeeName,
        position: offerLetter.position,
        status: offerLetter.status,
        signatureLink
      }
    });
  } catch (error) {
    console.error('Send offer letter error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/offer-letters/:organizationId
// @desc    Get all offer letters for organization
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const offerLetters = await OfferLetter.find({ organizationId })
      .populate('employeeId', 'name email')
      .populate('sentBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ offerLetters });
  } catch (error) {
    console.error('Get offer letters error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/offer-letters/sign/:token
// @desc    Get offer letter by signature token (public)
// @access  Public
router.get('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const offerLetter = await OfferLetter.findOne({ signatureToken: token })
      .populate('organizationId', 'name logo addressLine1 addressLine2 phone email');

    if (!offerLetter) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    // Check if expired
    if (new Date() > offerLetter.expiryDate) {
      return res.status(400).json({ message: 'This offer letter has expired' });
    }

    // Update viewed status if not already viewed
    if (offerLetter.status === 'pending') {
      offerLetter.status = 'viewed';
      offerLetter.viewedDate = new Date();
      await offerLetter.save();
    }

    res.json({
      offerLetter: {
        _id: offerLetter._id,
        employeeName: offerLetter.employeeName,
        position: offerLetter.position,
        salary: offerLetter.salary,
        joiningDate: offerLetter.joiningDate,
        htmlContent: offerLetter.htmlContent,
        status: offerLetter.status,
        signedDate: offerLetter.signedDate,
        organization: offerLetter.organizationId
      }
    });
  } catch (error) {
    console.error('Get offer letter by token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/offer-letters/sign/:token
// @desc    Sign offer letter
// @access  Public
router.post('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ message: 'Signature is required' });
    }

    const offerLetter = await OfferLetter.findOne({ signatureToken: token });

    if (!offerLetter) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    // Check if expired
    if (new Date() > offerLetter.expiryDate) {
      return res.status(400).json({ message: 'This offer letter has expired' });
    }

    // Check if already signed
    if (offerLetter.status === 'signed') {
      return res.status(400).json({ message: 'This offer letter has already been signed' });
    }

    // Save signature
    offerLetter.signature = signature;
    offerLetter.status = 'signed';
    offerLetter.signedDate = new Date();
    offerLetter.signedIp = req.ip || req.connection.remoteAddress;
    await offerLetter.save();

    res.json({
      message: 'Offer letter signed successfully',
      offerLetter: {
        id: offerLetter._id,
        status: offerLetter.status,
        signedDate: offerLetter.signedDate
      }
    });
  } catch (error) {
    console.error('Sign offer letter error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/offer-letters/:organizationId/employee/:employeeId
// @desc    Get offer letters for specific employee
// @access  Employee (own), OrgAdmin, SuperAdmin
router.get('/:organizationId/employee/:employeeId', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { organizationId, employeeId } = req.params;

    // Employees can only view their own offer letters
    if (req.user.role === 'employee') {
      if (String(req.user.employeeId) !== employeeId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const offerLetters = await OfferLetter.find({
      organizationId,
      employeeId
    }).populate('sentBy', 'email').sort({ createdAt: -1 });

    res.json({ offerLetters });
  } catch (error) {
    console.error('Get employee offer letters error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/offer-letters/download/:id/pdf
// @desc    Download signed offer letter as PDF
// @access  Public (with valid ID)
router.get('/download/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    const offerLetter = await OfferLetter.findById(id)
      .populate('organizationId', 'name');

    if (!offerLetter) {
      return res.status(404).json({ message: 'Offer letter not found' });
    }

    // Build HTML with signature
    let htmlContent = offerLetter.htmlContent;

    if (offerLetter.signature) {
      // Add signature to HTML
      htmlContent += `
        <div style="margin-top: 50px;">
          <div style="font-weight: bold;">Signed by:</div>
          <img src="${offerLetter.signature}" alt="Signature" style="max-width: 200px; border-bottom: 1px solid #000; margin: 10px 0;" />
          <div>${offerLetter.employeeName}</div>
          <div style="font-size: 12px; color: #666;">
            Date: ${offerLetter.signedDate.toLocaleDateString()}<br/>
            IP: ${offerLetter.signedIp || 'N/A'}
          </div>
        </div>
      `;
    }

    const fullHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Offer Letter - ${offerLetter.employeeName}</title>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    // Generate PDF
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.emulateMediaType('print');
      await page.setContent(fullHTML, { waitUntil: 'networkidle0', timeout: 30000 });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false
      });

      // Send PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="offer-letter-${offerLetter.employeeName.replace(/\s+/g, '_')}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer, 'binary');

    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
      throw new Error('Failed to generate PDF');
    } finally {
      if (browser) {
        await browser.close();
      }
    }

  } catch (error) {
    console.error('Download offer letter PDF error:', error);
    res.status(500).json({ message: error.message || 'Server error generating PDF' });
  }
});

export default router;
