import express from 'express';
import LearningPath from '../models/LearningPath.js';
import Course from '../models/Course.js';
import Employee from '../models/Employee.js';
import Notification from '../models/Notification.js';
import { protect, employeeOrOrgAdmin, checkOrganizationAccess, orgAdminOrSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/learning-paths/:organizationId/my-paths
// @desc    Get learning paths assigned to current user or global, with progress calculation
// @access  Employee, OrgAdmin
// NOTE: Must be defined before /:organizationId/:id to avoid route conflicts
router.get('/:organizationId/my-paths', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    // LearningPath.assignedTo stores Employee IDs, not User IDs
    const employee = await Employee.findOne({ userId: req.user._id, organizationId: req.params.organizationId });
    const employeeId = employee ? employee._id : null;

    const query = {
      organizationId: req.params.organizationId,
      isActive: true,
    };

    if (employeeId) {
      query.$or = [
        { assignedTo: employeeId },
        { isGlobal: true }
      ];
    } else {
      query.isGlobal = true;
    }

    const paths = await LearningPath.find(query)
      .populate('courses.courseId', 'title description completions')
      .sort({ createdAt: -1 });

    // Calculate progress for each learning path
    const pathsWithProgress = paths.map(path => {
      const pathObj = path.toObject();
      const totalCourses = pathObj.courses.length;
      let completedCourses = 0;
      let startedCourses = 0;

      pathObj.courses.forEach(courseItem => {
        if (courseItem.courseId && courseItem.courseId.completions) {
          const completion = courseItem.courseId.completions.find(
            c => c.employeeId && employeeId && c.employeeId.toString() === employeeId.toString()
          );
          if (completion) {
            startedCourses++;
            if (completion.progress === 100 && completion.certificateIssued) {
              completedCourses++;
            }
          }
        }
      });

      return {
        ...pathObj,
        progress: totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0,
        completedCourses,
        startedCourses,
        totalCourses
      };
    });

    res.json({ paths: pathsWithProgress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/learning-paths/:organizationId
// @desc    Get all learning paths (populate courses with title, description)
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const paths = await LearningPath.find({ organizationId: req.params.organizationId })
      .populate('courses.courseId', 'title description')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ paths });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/learning-paths/:organizationId/:id
// @desc    Get a single learning path by ID
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const path = await LearningPath.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('courses.courseId', 'title description category thumbnail duration')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'email');
    if (!path) return res.status(404).json({ message: 'Learning path not found' });
    res.json({ learningPath: path });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/learning-paths/:organizationId
// @desc    Create a new learning path
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { title, courses } = req.body;

    if (!title || !courses || !Array.isArray(courses)) {
      return res.status(400).json({ message: 'title and courses array are required' });
    }

    // Validate that all referenced courses exist within the organization
    const courseIds = courses.map(c => c.courseId);
    const existingCourses = await Course.find({
      _id: { $in: courseIds },
      organizationId: req.params.organizationId
    });

    if (existingCourses.length !== courseIds.length) {
      return res.status(400).json({ message: 'One or more course IDs are invalid or do not belong to this organization' });
    }

    const path = await LearningPath.create({
      ...req.body,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });

    const populated = await LearningPath.findById(path._id)
      .populate('courses.courseId', 'title description');

    res.status(201).json({ path: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/learning-paths/:organizationId/:id
// @desc    Update a learning path
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const path = await LearningPath.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      req.body,
      { new: true }
    )
      .populate('courses.courseId', 'title description')
      .populate('assignedTo', 'name email');

    if (!path) {
      return res.status(404).json({ message: 'Learning path not found' });
    }

    res.json({ path });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/learning-paths/:organizationId/:id
// @desc    Delete a learning path
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const path = await LearningPath.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!path) {
      return res.status(404).json({ message: 'Learning path not found' });
    }

    res.json({ message: 'Learning path deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/learning-paths/:organizationId/:id/assign
// @desc    Assign employees to a learning path
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/:id/assign', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { employeeIds } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'employeeIds array is required and must not be empty' });
    }

    const path = await LearningPath.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!path) {
      return res.status(404).json({ message: 'Learning path not found' });
    }

    // Validate that all employee IDs exist within this organization
    const employees = await Employee.find({
      _id: { $in: employeeIds },
      organizationId: req.params.organizationId
    });

    if (employees.length !== employeeIds.length) {
      return res.status(400).json({ message: 'One or more employee IDs are invalid or do not belong to this organization' });
    }

    // Add only employees not already assigned
    const existingIds = path.assignedTo.map(id => id.toString());
    const newEmployeeIds = employeeIds.filter(id => !existingIds.includes(id.toString()));

    if (newEmployeeIds.length > 0) {
      path.assignedTo.push(...newEmployeeIds);
      await path.save();

      // Send notification to newly assigned employees (look up their userId for notifications)
      const newEmployees = employees.filter(e => newEmployeeIds.includes(e._id.toString()));
      const notifications = newEmployees
        .filter(e => e.userId) // Only notify employees who have user accounts
        .map(e => ({
          userId: e.userId,
          organizationId: req.params.organizationId,
          type: 'course',
          title: 'Learning Path Assigned',
          message: `You have been assigned to the learning path: ${path.title}`,
          relatedId: path._id
        }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }

    const populated = await LearningPath.findById(path._id)
      .populate('courses.courseId', 'title description')
      .populate('assignedTo', 'name email');

    res.json({ path: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
