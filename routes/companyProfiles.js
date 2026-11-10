import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import CompanyProfile from '../models/CompanyProfile.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/company-logos';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'company-logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// @route   GET /api/company-profiles/:organizationId
// @desc    Get all company profiles for an organization
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const profiles = await CompanyProfile.find({ organizationId })
      .populate('createdBy', 'name email')
      .sort({ isDefault: -1, createdAt: -1 });

    res.json({ success: true, profiles });
  } catch (error) {
    console.error('Get company profiles error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/company-profiles/:organizationId/:id
// @desc    Get single company profile
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const profile = await CompanyProfile.findOne({ _id: id, organizationId })
      .populate('createdBy', 'name email');

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Company profile not found' });
    }

    res.json({ success: true, profile });
  } catch (error) {
    console.error('Get company profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/company-profiles/:organizationId
// @desc    Create new company profile
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, upload.single('companyLogo'), async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { profileName, companyName, companyEmail, companyAddress, companyPhone, bankAccountName, bankAccountNumber, bankTransitNumber, isDefault } = req.body;

    // Prepare logo URL if uploaded
    let companyLogoUrl = '';
    if (req.file) {
      companyLogoUrl = `${req.protocol}://${req.get('host')}/uploads/company-logos/${req.file.filename}`;
    }

    // If setting as default, unset other defaults for this org
    if (isDefault === 'true' || isDefault === true) {
      await CompanyProfile.updateMany(
        { organizationId, isDefault: true },
        { isDefault: false }
      );
    }

    const profile = await CompanyProfile.create({
      organizationId,
      profileName,
      companyName,
      companyEmail,
      companyAddress,
      companyPhone,
      bankAccountName,
      bankAccountNumber,
      bankTransitNumber,
      companyLogo: companyLogoUrl,
      isDefault: isDefault === 'true' || isDefault === true,
      createdBy: req.user._id
    });

    const populatedProfile = await CompanyProfile.findById(profile._id)
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, profile: populatedProfile });
  } catch (error) {
    console.error('Create company profile error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PUT /api/company-profiles/:organizationId/:id
// @desc    Update company profile
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, upload.single('companyLogo'), async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { profileName, companyName, companyEmail, companyAddress, companyPhone, bankAccountName, bankAccountNumber, bankTransitNumber, isDefault } = req.body;

    const profile = await CompanyProfile.findById(id);

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Company profile not found' });
    }

    // Check ownership
    if (profile.organizationId.toString() !== organizationId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Prepare logo URL if uploaded
    let companyLogoUrl = profile.companyLogo;
    if (req.file) {
      // Delete old logo file if exists
      if (profile.companyLogo) {
        const oldLogoPath = profile.companyLogo.replace(`${req.protocol}://${req.get('host')}/`, '');
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      companyLogoUrl = `${req.protocol}://${req.get('host')}/uploads/company-logos/${req.file.filename}`;
    }

    // If setting as default, unset other defaults
    if ((isDefault === 'true' || isDefault === true) && !profile.isDefault) {
      await CompanyProfile.updateMany(
        { organizationId, isDefault: true },
        { isDefault: false }
      );
    }

    profile.profileName = profileName || profile.profileName;
    profile.companyName = companyName || profile.companyName;
    profile.companyEmail = companyEmail || profile.companyEmail;
    profile.companyAddress = companyAddress || profile.companyAddress;
    profile.companyPhone = companyPhone || profile.companyPhone;
    profile.bankAccountName = bankAccountName || profile.bankAccountName;
    profile.bankAccountNumber = bankAccountNumber || profile.bankAccountNumber;
    profile.bankTransitNumber = bankTransitNumber || profile.bankTransitNumber;
    profile.companyLogo = companyLogoUrl;
    profile.isDefault = isDefault === 'true' || isDefault === true;

    await profile.save();

    const updatedProfile = await CompanyProfile.findById(profile._id)
      .populate('createdBy', 'name email');

    res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error('Update company profile error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/company-profiles/:organizationId/:id
// @desc    Delete company profile
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const profile = await CompanyProfile.findById(id);

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Company profile not found' });
    }

    // Check ownership
    if (profile.organizationId.toString() !== organizationId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Delete logo file if exists
    if (profile.companyLogo) {
      const logoPath = profile.companyLogo.replace(/^https?:\/\/[^\/]+\//, '');
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    await CompanyProfile.findByIdAndDelete(id);

    res.json({ success: true, message: 'Company profile deleted successfully' });
  } catch (error) {
    console.error('Delete company profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
