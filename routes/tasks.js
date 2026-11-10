import express from 'express';
import Task from '../models/Task.js';
import { protect, orgAdminOrSuperAdmin, employeeOrOrgAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/tasks/:organizationId
// @desc    Get all tasks for an organization (or for a specific project or employee)
// @access  OrgAdmin, SuperAdmin, Employee
router.get('/:organizationId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { projectId, status } = req.query;

    let query = { organizationId };

    // Filter by project if provided
    if (projectId) {
      query.projectId = projectId;
    }

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // If employee, only show tasks assigned to them
    if (req.user.role === 'employee') {
      if (!req.user.employeeId) return res.json({ tasks: [] });
      query.assignedTo = req.user.employeeId;
    }

    const tasks = await Task.find(query)
      .populate('projectId', 'name')
      .populate('assignedTo', 'name email')
      .sort({ dueDate: 1, createdAt: -1 });

    res.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/tasks/:organizationId/:id
// @desc    Get single task
// @access  OrgAdmin, SuperAdmin, Employee (if assigned)
router.get('/:organizationId/:id', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const task = await Task.findOne({ _id: id, organizationId })
      .populate('projectId', 'name')
      .populate('assignedTo', 'name email');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if employee is assigned to this task
    if (req.user.role === 'employee') {
      if (!task.assignedTo || task.assignedTo._id.toString() !== String(req.user.employeeId)) {
        return res.status(403).json({ message: 'Access denied to this task' });
      }
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/tasks/:organizationId
// @desc    Create new task
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { projectId, title, description, assignedTo, status, priority, dueDate } = req.body;

    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required' });
    }

    const task = await Task.create({
      organizationId,
      projectId,
      title,
      description,
      assignedTo,
      status,
      priority,
      dueDate
    });

    const populatedTask = await Task.findById(task._id)
      .populate('projectId', 'name')
      .populate('assignedTo', 'name email');

    res.status(201).json({ task: populatedTask });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/tasks/:organizationId/:id
// @desc    Update task (employees can only update status)
// @access  OrgAdmin, SuperAdmin, Employee (limited)
router.put('/:organizationId/:id', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;
    const { title, description, assignedTo, status, priority, dueDate } = req.body;

    const task = await Task.findOne({ _id: id, organizationId });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // If employee, they can only update their own tasks and only the status
    if (req.user.role === 'employee') {
      if (!task.assignedTo || task.assignedTo.toString() !== String(req.user.employeeId)) {
        return res.status(403).json({ message: 'Access denied to this task' });
      }
      // Employees can only update status
      if (status !== undefined) {
        task.status = status;
      }
    } else {
      // Org admins can update all fields
      task.title = title !== undefined ? title : task.title;
      task.description = description !== undefined ? description : task.description;
      task.assignedTo = assignedTo !== undefined ? assignedTo : task.assignedTo;
      task.status = status !== undefined ? status : task.status;
      task.priority = priority !== undefined ? priority : task.priority;
      task.dueDate = dueDate !== undefined ? dueDate : task.dueDate;
    }

    await task.save();

    const updatedTask = await Task.findById(task._id)
      .populate('projectId', 'name')
      .populate('assignedTo', 'name email');

    res.json({ task: updatedTask });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/tasks/:organizationId/:id
// @desc    Delete task
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { id, organizationId } = req.params;

    const task = await Task.findOne({ _id: id, organizationId });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    await Task.deleteOne({ _id: id });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
