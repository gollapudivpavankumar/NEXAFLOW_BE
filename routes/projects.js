import express from 'express';
import Project from '../models/Project.js';
import { protect, orgAdminOrSuperAdmin, employeeOrOrgAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/projects/:organizationId
// @desc    Get all projects for an organization
// @access  OrgAdmin, SuperAdmin, Employee
router.get('/:organizationId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    let query = { organizationId };

    // If employee, only show projects they're assigned to
    if (req.user.role === 'employee' && req.user.employeeId) {
      query.assignedEmployees = req.user.employeeId;
    }

    const projects = await Project.find(query)
      .populate('createdBy', 'email')
      .populate('assignedEmployees', 'name email')
      .sort({ createdAt: -1 });

    res.json({ projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/projects/:organizationId/:id
// @desc    Get single project
// @access  OrgAdmin, SuperAdmin, Employee
router.get('/:organizationId/:id', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const project = await Project.findOne({ _id: id, organizationId })
      .populate('createdBy', 'email')
      .populate('assignedEmployees', 'name email');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if employee is assigned to this project
    if (req.user.role === 'employee' && req.user.employeeId) {
      const isAssigned = project.assignedEmployees.some(emp => emp._id.toString() === req.user.employeeId.toString());
      if (!isAssigned) {
        return res.status(403).json({ message: 'Access denied to this project' });
      }
    }

    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/projects/:organizationId
// @desc    Create new project
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, description, status, startDate, endDate, assignedEmployees } = req.body;

    const project = await Project.create({
      organizationId,
      name,
      description,
      status,
      startDate,
      endDate,
      assignedEmployees: assignedEmployees || [],
      createdBy: req.user._id
    });

    const populatedProject = await Project.findById(project._id)
      .populate('createdBy', 'email')
      .populate('assignedEmployees', 'name email');

    res.status(201).json({ project: populatedProject });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/projects/:organizationId/:id
// @desc    Update project
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { name, description, status, startDate, endDate, assignedEmployees } = req.body;

    const project = await Project.findOne({ _id: id, organizationId });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    project.name = name !== undefined ? name : project.name;
    project.description = description !== undefined ? description : project.description;
    project.status = status !== undefined ? status : project.status;
    project.startDate = startDate !== undefined ? startDate : project.startDate;
    project.endDate = endDate !== undefined ? endDate : project.endDate;
    project.assignedEmployees = assignedEmployees !== undefined ? assignedEmployees : project.assignedEmployees;

    await project.save();

    const updatedProject = await Project.findById(project._id)
      .populate('createdBy', 'email')
      .populate('assignedEmployees', 'name email');

    res.json({ project: updatedProject });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/projects/:organizationId/:id
// @desc    Delete project
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const project = await Project.findOne({ _id: id, organizationId });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    await Project.deleteOne({ _id: id });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
