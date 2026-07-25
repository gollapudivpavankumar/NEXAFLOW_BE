import express from 'express';
import EmailAccount from '../models/EmailAccount.js';
import Organization from '../models/Organization.js';
import Employee from '../models/Employee.js';
import axios from 'axios';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';
import { getDnsRecords, getWebmailUrl, resolveCpanelConfig, MAIL_INFRA } from '../config/cpanel.js';
import { createEmailAccount, deleteEmailAccount, changeEmailPassword, testConnection } from '../services/cpanelService.js';
import { encryptSecret } from '../utils/mailCrypto.js';

// cPanel UAPI returns { status: 1 } on success, { status: 0, errors: [...] } on
// failure. Turn a failure into a thrown Error with a readable message.
function assertCpanelOk(data) {
  if (data && data.status === 0) {
    const msg = (data.errors && data.errors.join('; ')) || 'cPanel operation failed';
    throw new Error(msg);
  }
  return data;
}

const router = express.Router();

// @route   GET /api/email-accounts/:organizationId/dns-config
// @desc    DNS records an org adds at their registrar to route their own
//          domain's email through the shared cPanel mail server.
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/dns-config', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.organizationId).select('cpanelDomain email name');
    // Prefer the org's configured mail domain; fall back to the domain part of
    // its contact email; finally a placeholder.
    const domain = org?.cpanelDomain
      || (org?.email && org.email.includes('@') ? org.email.split('@')[1] : '')
      || 'yourdomain.com';

    const dns = getDnsRecords(domain);
    res.json({
      domain,
      serverHost: MAIL_INFRA.serverHost,
      serverIp: MAIL_INFRA.serverIp,
      webmailUrl: getWebmailUrl(org || {}),
      ...dns,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/email-accounts/:organizationId/my-email
// @desc    Employee gets their email account
// @access  Employee, OrgAdmin
// MUST come before /:organizationId/:id
router.get('/:organizationId/my-email', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const emailAccount = await EmailAccount.findOne({
      organizationId: req.params.organizationId,
      employeeId: req.user.employeeId,
      status: { $ne: 'deleted' }
    });

    if (!emailAccount) {
      return res.status(404).json({ message: 'Email account not found' });
    }

    res.json({ emailAccount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/email-accounts/:organizationId/my-email/change-password
// @desc    Employee resets the password of THEIR OWN mailbox
// @access  Employee, OrgAdmin
// MUST be registered before /:organizationId/:id/change-password
router.put('/:organizationId/my-email/change-password', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'No mailbox is linked to your account' });
    }

    const emailAccount = await EmailAccount.findOne({
      organizationId: req.params.organizationId,
      employeeId: req.user.employeeId,
      status: { $ne: 'deleted' },
    });
    if (!emailAccount) {
      return res.status(404).json({ message: 'You do not have a mailbox yet' });
    }

    const org = await Organization.findById(req.params.organizationId);
    try {
      const data = await changeEmailPassword(org, emailAccount.emailAddress, password);
      assertCpanelOk(data);
    } catch (cpanelError) {
      return res.status(400).json({ message: `Could not change your mailbox password: ${cpanelError.message}` });
    }

    emailAccount.secret = encryptSecret(password);
    await emailAccount.save();

    res.json({ message: 'Your mailbox password was changed', emailAddress: emailAccount.emailAddress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/email-accounts/:organizationId/cpanel-settings
// @desc    Admin updates cPanel settings on Organization
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/cpanel-settings', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { cpanelHost, cpanelPort, cpanelUsername, cpanelApiToken, cpanelDomain } = req.body;

    const updateFields = {
      cpanelHost,
      cpanelPort,
      cpanelUsername,
      cpanelDomain
    };

    // Only update API token if a non-empty value is provided
    if (cpanelApiToken) {
      updateFields.cpanelApiToken = cpanelApiToken;
    }

    const org = await Organization.findByIdAndUpdate(
      req.params.organizationId,
      updateFields,
      { new: true }
    );

    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    res.json({ message: 'cPanel settings updated successfully', organization: org });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/email-accounts/:organizationId/cpanel-settings
// @desc    Get cPanel settings for the organization
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/cpanel-settings', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.organizationId)
      .select('cpanelHost cpanelPort cpanelUsername cpanelDomain email');

    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Report the RESOLVED config (org-specific values over shared defaults) so
    // email is "configured" for every org out of the box via the shared account.
    const cfg = resolveCpanelConfig(org);
    const usingShared = !org.cpanelHost && !org.cpanelUsername;

    res.json({
      configured: !!(cfg.cpanelHost && cfg.cpanelUsername && cfg.cpanelApiToken && cfg.cpanelDomain),
      usingShared,
      cpanelHost: cfg.cpanelHost,
      cpanelPort: cfg.cpanelPort,
      cpanelUsername: cfg.cpanelUsername,
      cpanelDomain: cfg.cpanelDomain,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/email-accounts/:organizationId/test-connection
// @desc    Test cPanel connection
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/test-connection', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.organizationId);

    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const result = await testConnection(org);
    if (result.success) {
      res.json({
        success: true,
        message: 'cPanel connection successful',
        emailCount: result.data?.data?.length || 0,
      });
    } else {
      res.status(400).json({ success: false, message: 'cPanel connection failed', error: result.message });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/email-accounts/:organizationId
// @desc    Admin gets all email accounts
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const emailAccounts = await EmailAccount.find({
      organizationId: req.params.organizationId,
      status: { $ne: 'deleted' }
    })
      .populate('employeeId', 'name email department')
      .sort({ createdAt: -1 });

    res.json({ emailAccounts });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/email-accounts/:organizationId
// @desc    Admin creates email account
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { employeeId, username, password, quota } = req.body;

    if (!employeeId || !username || !password) {
      return res.status(400).json({ message: 'employeeId, username, and password are required' });
    }

    const org = await Organization.findById(req.params.organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const cfg = resolveCpanelConfig(org);
    const domain = cfg.cpanelDomain;
    const localPart = username.replace(/@.*$/, '').trim(); // accept "john" or "john@domain"
    const emailAddress = `${localPart}@${domain}`;
    const webmailUrl = getWebmailUrl(org);

    // Provision the real mailbox on cPanel. If this fails, do NOT create a
    // phantom local record — surface the reason so the admin isn't confused.
    try {
      const data = await createEmailAccount(org, localPart, password, quota || 1024);
      assertCpanelOk(data);
    } catch (cpanelError) {
      return res.status(400).json({
        message: `Could not create the mailbox on the mail server: ${cpanelError.message}`,
      });
    }

    // Store the encrypted password so the in-ERP webmail can auto-connect.
    const secret = encryptSecret(password);

    // Avoid duplicate local records for the same address.
    let emailAccount = await EmailAccount.findOne({ organizationId: req.params.organizationId, emailAddress });
    if (emailAccount) {
      emailAccount.status = 'active';
      emailAccount.employeeId = employeeId;
      emailAccount.quota = quota || 1024;
      emailAccount.webmailUrl = webmailUrl;
      emailAccount.secret = secret;
      await emailAccount.save();
    } else {
      emailAccount = await EmailAccount.create({
        organizationId: req.params.organizationId,
        employeeId,
        emailAddress,
        domain,
        quota: quota || 1024,
        webmailUrl,
        secret,
        createdBy: req.user._id,
      });
    }

    res.status(201).json({ emailAccount, cpanelResult: { success: true }, message: `Mailbox ${emailAddress} created` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/email-accounts/:organizationId/:id/change-password
// @desc    Admin changes email password
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id/change-password', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const emailAccount = await EmailAccount.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!emailAccount) {
      return res.status(404).json({ message: 'Email account not found' });
    }

    const org = await Organization.findById(req.params.organizationId);

    try {
      const data = await changeEmailPassword(org, emailAccount.emailAddress, password);
      assertCpanelOk(data);
    } catch (cpanelError) {
      return res.status(400).json({ message: `Could not change the mailbox password: ${cpanelError.message}` });
    }

    // Keep the stored secret in sync so webmail auto-login still works.
    emailAccount.secret = encryptSecret(password);
    await emailAccount.save();

    res.json({ message: 'Password changed', emailAccount: { _id: emailAccount._id }, cpanelResult: { success: true } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/email-accounts/:organizationId/:id
// @desc    Admin deletes email account
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const emailAccount = await EmailAccount.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!emailAccount) {
      return res.status(404).json({ message: 'Email account not found' });
    }

    const org = await Organization.findById(req.params.organizationId);
    let cpanelResult = { success: true };

    try {
      const data = await deleteEmailAccount(org, emailAccount.emailAddress);
      assertCpanelOk(data);
    } catch (cpanelError) {
      // Don't block the local removal if the mailbox is already gone upstream,
      // but report what happened.
      cpanelResult = { success: false, error: cpanelError.message };
    }

    // Soft-delete the record
    emailAccount.status = 'deleted';
    await emailAccount.save();

    res.json({ message: 'Email account deleted', cpanelResult });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
