import express from 'express';
import OfferLetterTemplate from '../models/OfferLetterTemplate.js';
import { protect, superAdminOnly, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/offer-letter-templates/:organizationId
// @desc    Get all offer letter templates (global + org custom)
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Get global templates and org-specific templates
    const templates = await OfferLetterTemplate.find({
      $or: [
        { isGlobal: true, isActive: true },
        { organizationId, isActive: true }
      ]
    }).populate('createdBy', 'email').sort({ isDefault: -1, createdAt: -1 });

    res.json({ templates });
  } catch (error) {
    console.error('Get offer letter templates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/offer-letter-templates/:organizationId
// @desc    Create custom offer letter template
// @access  OrgAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, htmlContent, isDefault } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Template name is required' });
    }

    if (!htmlContent || htmlContent.trim().length === 0) {
      return res.status(400).json({ message: 'HTML content is required' });
    }

    // Validate HTML content size (max 1MB)
    if (htmlContent.length > 1024 * 1024) {
      return res.status(400).json({ message: 'HTML content is too large (max 1MB)' });
    }

    // If setting as default, unset other defaults for this org
    if (isDefault) {
      await OfferLetterTemplate.updateMany(
        { organizationId, isDefault: true },
        { isDefault: false }
      );
    }

    const template = await OfferLetterTemplate.create({
      name,
      htmlContent,
      isGlobal: false,
      organizationId,
      createdBy: req.user._id,
      isDefault: isDefault || false
    });

    const populatedTemplate = await OfferLetterTemplate.findById(template._id).populate('createdBy', 'email');

    res.status(201).json({ template: populatedTemplate });
  } catch (error) {
    console.error('Create offer letter template error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/offer-letter-templates/global/create
// @desc    Create global offer letter template (super admin)
// @access  SuperAdmin
router.post('/global/create', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, htmlContent, isDefault } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Template name is required' });
    }

    if (!htmlContent || htmlContent.trim().length === 0) {
      return res.status(400).json({ message: 'HTML content is required' });
    }

    // Validate HTML content size (max 1MB)
    if (htmlContent.length > 1024 * 1024) {
      return res.status(400).json({ message: 'HTML content is too large (max 1MB)' });
    }

    // If setting as default, unset other global defaults
    if (isDefault) {
      await OfferLetterTemplate.updateMany(
        { isGlobal: true, isDefault: true },
        { isDefault: false }
      );
    }

    const template = await OfferLetterTemplate.create({
      name,
      htmlContent,
      isGlobal: true,
      organizationId: null,
      createdBy: req.user._id,
      isDefault: isDefault || false
    });

    const populatedTemplate = await OfferLetterTemplate.findById(template._id).populate('createdBy', 'email');

    res.status(201).json({ template: populatedTemplate });
  } catch (error) {
    console.error('Create global offer letter template error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/offer-letter-templates/:organizationId/:id
// @desc    Update offer letter template
// @access  OrgAdmin (own templates), SuperAdmin (all)
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { name, htmlContent, isDefault, isActive } = req.body;

    const template = await OfferLetterTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Org admins can only update their own templates
    if (req.user.role === 'orgadmin' && template.isGlobal) {
      return res.status(403).json({ message: 'Cannot modify global templates' });
    }

    if (req.user.role === 'orgadmin' && template.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // If setting as default, unset other defaults
    if (isDefault && !template.isDefault) {
      const query = template.isGlobal ?
        { isGlobal: true, isDefault: true } :
        { organizationId, isDefault: true };
      await OfferLetterTemplate.updateMany(query, { isDefault: false });
    }

    template.name = name !== undefined ? name : template.name;
    template.htmlContent = htmlContent !== undefined ? htmlContent : template.htmlContent;
    template.isDefault = isDefault !== undefined ? isDefault : template.isDefault;
    template.isActive = isActive !== undefined ? isActive : template.isActive;

    await template.save();

    const updatedTemplate = await OfferLetterTemplate.findById(template._id).populate('createdBy', 'email');

    res.json({ template: updatedTemplate });
  } catch (error) {
    console.error('Update offer letter template error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/offer-letter-templates/:organizationId/:id
// @desc    Delete offer letter template (soft delete)
// @access  OrgAdmin (own templates), SuperAdmin (all)
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const template = await OfferLetterTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Org admins can only delete their own templates
    if (req.user.role === 'orgadmin' && template.isGlobal) {
      return res.status(403).json({ message: 'Cannot delete global templates' });
    }

    if (req.user.role === 'orgadmin' && template.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Soft delete
    template.isActive = false;
    await template.save();

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete offer letter template error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
