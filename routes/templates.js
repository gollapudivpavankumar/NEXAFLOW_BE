import express from 'express';
import PayslipTemplate from '../models/PayslipTemplate.js';
import { protect, superAdminOnly, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// NOTE: Specific "/global/*" routes must be registered BEFORE the
// parameterized "/:organizationId/:id" route below. Otherwise a request to
// GET /global/list is captured by "/:organizationId/:id" (organizationId=global,
// id=list) and PayslipTemplate.findById('list') throws a CastError -> 500.

// @route   GET /api/templates/global/list
// @desc    Get all global templates (super admin)
// @access  SuperAdmin
router.get('/global/list', protect, superAdminOnly, async (req, res) => {
  try {
    const templates = await PayslipTemplate.find({ isGlobal: true })
      .populate('createdBy', 'email')
      .sort({ isDefault: -1, createdAt: -1 });

    res.json({ templates });
  } catch (error) {
    console.error('Get global templates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/templates/:organizationId
// @desc    Get all templates (global + org custom) for an organization
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Get global templates and org-specific templates
    const templates = await PayslipTemplate.find({
      $or: [
        { isGlobal: true, isActive: true },
        { organizationId, isActive: true }
      ]
    }).populate('createdBy', 'email').sort({ isDefault: -1, createdAt: -1 });

    res.json({ templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/templates/:organizationId/:id
// @desc    Get single template
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const template = await PayslipTemplate.findById(id).populate('createdBy', 'email');

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/templates/:organizationId
// @desc    Create custom template for organization
// @access  OrgAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, htmlContent, isDefault } = req.body;

    // If setting as default, unset other defaults for this org
    if (isDefault) {
      await PayslipTemplate.updateMany(
        { organizationId, isDefault: true },
        { isDefault: false }
      );
    }

    const template = await PayslipTemplate.create({
      name,
      htmlContent,
      isGlobal: false,
      organizationId,
      createdBy: req.user._id,
      isDefault: isDefault || false
    });

    const populatedTemplate = await PayslipTemplate.findById(template._id).populate('createdBy', 'email');

    res.status(201).json({ template: populatedTemplate });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/templates/global
// @desc    Create global template (super admin only)
// @access  SuperAdmin
router.post('/global/create', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, htmlContent, isDefault } = req.body;

    // If setting as default, unset other global defaults
    if (isDefault) {
      await PayslipTemplate.updateMany(
        { isGlobal: true, isDefault: true },
        { isDefault: false }
      );
    }

    const template = await PayslipTemplate.create({
      name,
      htmlContent,
      isGlobal: true,
      organizationId: null,
      createdBy: req.user._id,
      isDefault: isDefault || false
    });

    const populatedTemplate = await PayslipTemplate.findById(template._id).populate('createdBy', 'email');

    res.status(201).json({ template: populatedTemplate });
  } catch (error) {
    console.error('Create global template error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/templates/:organizationId/:id
// @desc    Update template
// @access  OrgAdmin (own templates), SuperAdmin (all)
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { name, htmlContent, isDefault, isActive } = req.body;

    const template = await PayslipTemplate.findById(id);

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
      await PayslipTemplate.updateMany(query, { isDefault: false });
    }

    template.name = name !== undefined ? name : template.name;
    template.htmlContent = htmlContent !== undefined ? htmlContent : template.htmlContent;
    template.isDefault = isDefault !== undefined ? isDefault : template.isDefault;
    template.isActive = isActive !== undefined ? isActive : template.isActive;

    await template.save();

    const updatedTemplate = await PayslipTemplate.findById(template._id).populate('createdBy', 'email');

    res.json({ template: updatedTemplate });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/templates/:organizationId/:id
// @desc    Delete template (soft delete - set isActive false)
// @access  OrgAdmin (own templates), SuperAdmin (all)
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const template = await PayslipTemplate.findById(id);

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
    console.error('Delete template error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
