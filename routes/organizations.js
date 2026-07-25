import express from 'express';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import { protect, superAdminOnly } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/organizations
// @desc    Create a new organization (SuperAdmin only)
// @access  Private/SuperAdmin
router.post('/', protect, superAdminOnly, async (req, res) => {
  try {
    const {
      name, email, password,
      // Basic information
      slug, code, shortCode, phone, logo, industry, companySize,
      foundedYear, website, description,
      // Location
      addressLine1, addressLine2, city, province, postalCode,
      // Financial & legal
      currency, fiscalYearStartMonth, taxId, registrationNumber, timezone,
      // Subscription & theme
      themeColor, subscriptionPlan, subscriptionStartDate, subscriptionEndDate
    } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    // Check if organization already exists
    const orgExists = await Organization.findOne({
      $or: [{ email }, { name }]
    });

    if (orgExists) {
      return res.status(400).json({ message: 'Organization with this name or email already exists' });
    }

    // Check if user with this email exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Build organization data, only setting provided optional fields
    const orgData = { name, email };
    if (slug !== undefined && slug !== '') orgData.slug = slug;
    if (code !== undefined) orgData.code = code;
    if (shortCode !== undefined) orgData.shortCode = shortCode;
    if (phone !== undefined) orgData.phone = phone;
    if (logo !== undefined) orgData.logo = logo;
    if (industry !== undefined) orgData.industry = industry;
    if (companySize !== undefined) orgData.companySize = companySize;
    if (foundedYear !== undefined && foundedYear !== null && foundedYear !== '') orgData.foundedYear = foundedYear;
    if (website !== undefined) orgData.website = website;
    if (description !== undefined) orgData.description = description;
    if (addressLine1 !== undefined) orgData.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) orgData.addressLine2 = addressLine2;
    if (city !== undefined) orgData.city = city;
    if (province !== undefined) orgData.province = province;
    if (postalCode !== undefined) orgData.postalCode = postalCode;
    if (currency !== undefined && currency !== '') orgData.currency = currency;
    if (fiscalYearStartMonth !== undefined && fiscalYearStartMonth !== null && fiscalYearStartMonth !== '') orgData.fiscalYearStartMonth = fiscalYearStartMonth;
    if (taxId !== undefined) orgData.taxId = taxId;
    if (registrationNumber !== undefined) orgData.registrationNumber = registrationNumber;
    if (timezone !== undefined && timezone !== '') orgData.timezone = timezone;
    if (themeColor !== undefined) orgData.themeColor = themeColor;
    if (subscriptionPlan !== undefined && subscriptionPlan !== '') orgData.subscriptionPlan = subscriptionPlan;
    if (subscriptionStartDate !== undefined && subscriptionStartDate !== null && subscriptionStartDate !== '') orgData.subscriptionStartDate = subscriptionStartDate;
    if (subscriptionEndDate !== undefined && subscriptionEndDate !== null && subscriptionEndDate !== '') orgData.subscriptionEndDate = subscriptionEndDate;

    // Create organization
    const organization = await Organization.create(orgData);

    // Create org admin user
    const user = await User.create({
      email,
      password,
      role: 'orgadmin',
      organizationId: organization._id
    });

    res.status(201).json({
      message: 'Organization created successfully',
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        slug: organization.slug,
        code: organization.code,
        shortCode: organization.shortCode,
        industry: organization.industry,
        isActive: organization.isActive,
        createdAt: organization.createdAt
      },
      admin: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/organizations
// @desc    Get all organizations
// @access  Private/SuperAdmin
router.get('/', protect, superAdminOnly, async (req, res) => {
  try {
    const organizations = await Organization.find().sort({ createdAt: -1 });

    // Get admin user for each organization
    const orgsWithAdmins = await Promise.all(
      organizations.map(async (org) => {
        const admin = await User.findOne({ organizationId: org._id, role: 'orgadmin' }).select('-password');
        return {
          id: org._id,
          name: org.name,
          email: org.email,
          isActive: org.isActive,
          createdAt: org.createdAt,
          admin: admin ? {
            id: admin._id,
            email: admin.email
          } : null
        };
      })
    );

    res.json({ organizations: orgsWithAdmins });
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/organizations/:id
// @desc    Get single organization
// @access  Private/SuperAdmin
router.get('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const admin = await User.findOne({ organizationId: organization._id, role: 'orgadmin' }).select('-password');

    res.json({
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        isActive: organization.isActive,
        createdAt: organization.createdAt,
        admin: admin ? {
          id: admin._id,
          email: admin.email
        } : null
      }
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/organizations/:id
// @desc    Update organization
// @access  Private/SuperAdmin
router.put('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, isActive } = req.body;

    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Update fields
    if (name) organization.name = name;
    if (email) organization.email = email;
    if (typeof isActive !== 'undefined') organization.isActive = isActive;

    await organization.save();

    res.json({
      message: 'Organization updated successfully',
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        isActive: organization.isActive
      }
    });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/organizations/settings/:id
// @desc    Update organization settings (OrgAdmin can update their own org)
// @access  Private/OrgAdmin
router.put('/settings/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, logo, addressLine1, addressLine2, bankName, bankTransit,
      smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword, smtpFromEmail, smtpFromName,
      themeColor
    } = req.body;

    // Check if user has access to this organization
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== id) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const organization = await Organization.findById(id);

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Update fields
    if (name) organization.name = name;
    if (email) organization.email = email;
    if (phone !== undefined) organization.phone = phone;
    if (logo !== undefined) organization.logo = logo;
    if (addressLine1 !== undefined) organization.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) organization.addressLine2 = addressLine2;
    if (bankName !== undefined) organization.bankName = bankName;
    if (bankTransit !== undefined) organization.bankTransit = bankTransit;

    // Update theme
    if (themeColor !== undefined) organization.themeColor = themeColor;

    // Update SMTP settings
    if (smtpHost !== undefined) organization.smtpHost = smtpHost;
    if (smtpPort !== undefined) organization.smtpPort = smtpPort;
    if (smtpSecure !== undefined) organization.smtpSecure = smtpSecure;
    if (smtpUser !== undefined) organization.smtpUser = smtpUser;
    if (smtpPassword !== undefined) organization.smtpPassword = smtpPassword;
    if (smtpFromEmail !== undefined) organization.smtpFromEmail = smtpFromEmail;
    if (smtpFromName !== undefined) organization.smtpFromName = smtpFromName;

    await organization.save();

    res.json({
      message: 'Organization settings updated successfully',
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        logo: organization.logo,
        addressLine1: organization.addressLine1,
        addressLine2: organization.addressLine2,
        bankName: organization.bankName,
        bankTransit: organization.bankTransit,
        smtpHost: organization.smtpHost,
        smtpPort: organization.smtpPort,
        smtpSecure: organization.smtpSecure,
        smtpUser: organization.smtpUser,
        // Don't send password to client
        smtpFromEmail: organization.smtpFromEmail,
        smtpFromName: organization.smtpFromName
      }
    });
  } catch (error) {
    console.error('Update organization settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/organizations/:id
// @desc    Delete organization
// @access  Private/SuperAdmin
router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    await Organization.findByIdAndDelete(req.params.id);

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
