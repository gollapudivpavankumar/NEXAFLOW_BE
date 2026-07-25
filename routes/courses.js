import express from 'express';
import Course from '../models/Course.js';
import Employee from '../models/Employee.js';
import CourseDiscussion from '../models/CourseDiscussion.js';
import CourseAssignment from '../models/CourseAssignment.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all courses (admin)
router.get('/:organizationId/admin', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const courses = await Course.find({ organizationId: req.params.organizationId })
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 });
    res.json({ courses });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get my courses (employee)
router.get('/:organizationId/my-courses', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const courses = await Course.find({
      organizationId: req.params.organizationId,
      isActive: true,
      $or: [
        { isGlobal: true },
        { assignedTo: employee._id }
      ]
    }).sort({ createdAt: -1 });

    // Add progress for each course
    const coursesWithProgress = courses.map(course => {
      const completion = course.completions.find(
        c => c.employeeId.toString() === employee._id.toString()
      );
      return {
        ...course.toObject(),
        myProgress: completion?.progress || 0,
        myVideosCompleted: completion?.videosCompleted || [],
        myQuizScore: completion?.quizScore || null,
        certificateIssued: completion?.certificateIssued || false
      };
    });

    res.json({ courses: coursesWithProgress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all courses user is enrolled in with progress
// NOTE: Must be defined before /:organizationId/:id to avoid route conflicts
router.get('/:orgId/my-enrolled', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Find courses where user is enrolled (via enrolledUsers or assignedTo or isGlobal)
    const courses = await Course.find({
      organizationId: req.params.orgId,
      isActive: true,
      $or: [
        { enrolledUsers: req.user._id },
        { assignedTo: employee._id },
        { isGlobal: true }
      ]
    }).sort({ createdAt: -1 });

    const coursesWithProgress = courses.map(course => {
      const completion = course.completions.find(
        c => c.employeeId.toString() === employee._id.toString()
      );

      const totalVideos = course.videos.length;
      const videosCompleted = completion?.videosCompleted?.length || 0;
      const progress = completion?.progress || 0;
      const isCompleted = progress === 100 && (completion?.certificateIssued || false);

      return {
        _id: course._id,
        title: course.title,
        description: course.description,
        category: course.category,
        thumbnail: course.thumbnail,
        duration: course.duration,
        difficulty: course.difficulty,
        instructor: course.instructor,
        tags: course.tags,
        averageRating: course.averageRating,
        totalVideos,
        videosCompleted,
        progress,
        quizScore: completion?.quizScore || null,
        certificateIssued: completion?.certificateIssued || false,
        isCompleted,
        completedDate: completion?.completedDate || null
      };
    });

    res.json({
      courses: coursesWithProgress,
      totalEnrolled: coursesWithProgress.length,
      totalCompleted: coursesWithProgress.filter(c => c.isCompleted).length,
      totalInProgress: coursesWithProgress.filter(c => c.progress > 0 && !c.isCompleted).length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get course details
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Check if user has access
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });

      const hasAccess = course.isGlobal || course.assignedTo.some(
        id => id.toString() === employee._id.toString()
      );

      if (!hasAccess) {
        return res.status(403).json({ message: 'You do not have access to this course' });
      }

      // Get user's progress
      const completion = course.completions.find(
        c => c.employeeId.toString() === employee._id.toString()
      );

      return res.json({
        course: {
          ...course.toObject(),
          myProgress: completion?.progress || 0,
          myVideosCompleted: completion?.videosCompleted || [],
          myQuizScore: completion?.quizScore || null,
          certificateIssued: completion?.certificateIssued || false
        }
      });
    }

    res.json({ course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create course
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const course = await Course.create({
      ...req.body,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });
    res.status(201).json({ course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update course
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      req.body,
      { new: true }
    );

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({ course });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark video as completed
router.post('/:organizationId/:id/complete-video', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { videoIndex } = req.body;

    if (videoIndex === undefined || videoIndex === null) {
      return res.status(400).json({ message: 'videoIndex is required' });
    }

    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const course = await Course.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Validate videoIndex is within range
    if (videoIndex < 0 || videoIndex >= course.videos.length) {
      return res.status(400).json({ message: `Invalid videoIndex. Must be between 0 and ${course.videos.length - 1}` });
    }

    // Find or create completion record
    let completion = course.completions.find(
      c => c.employeeId.toString() === employee._id.toString()
    );

    if (!completion) {
      course.completions.push({
        employeeId: employee._id,
        progress: 0,
        videosCompleted: [],
        certificateIssued: false
      });
      completion = course.completions[course.completions.length - 1];
    }

    // Add video to completed if not already there
    if (!completion.videosCompleted.includes(videoIndex)) {
      completion.videosCompleted.push(videoIndex);
    }

    // Calculate progress (guard against division by zero)
    const totalVideos = course.videos.length;
    completion.progress = totalVideos === 0 ? 100 : Math.round((completion.videosCompleted.length / totalVideos) * 100);

    await course.save();
    res.json({ message: 'Video marked as completed', progress: completion.progress });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Submit quiz
router.post('/:organizationId/:id/submit-quiz', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { answers } = req.body; // Array of selected answer indices

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'answers array is required' });
    }

    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const course = await Course.findOne({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (course.quiz.length === 0) {
      return res.status(400).json({ message: 'This course has no quiz' });
    }

    // Calculate score (guard against division by zero)
    let correctAnswers = 0;
    course.quiz.forEach((question, index) => {
      if (answers[index] === question.correctAnswer) {
        correctAnswers++;
      }
    });

    const score = course.quiz.length === 0 ? 100 : Math.round((correctAnswers / course.quiz.length) * 100);

    // Find or create completion record
    let completion = course.completions.find(
      c => c.employeeId.toString() === employee._id.toString()
    );

    if (!completion) {
      course.completions.push({
        employeeId: employee._id,
        progress: 0,
        videosCompleted: [],
        quizScore: score,
        certificateIssued: false
      });
      completion = course.completions[course.completions.length - 1];
    } else {
      completion.quizScore = score;
    }

    // If quiz passed (>= 70%) and all videos completed, mark as complete and issue certificate
    if (score >= 70 && completion.progress === 100) {
      completion.completedDate = new Date();
      completion.certificateIssued = true;
    }

    await course.save();
    res.json({
      message: 'Quiz submitted successfully',
      score,
      certificateIssued: completion.certificateIssued
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get course statistics (admin)
router.get('/:organizationId/:id/statistics', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('completions.employeeId', 'name email');

    if (!course) return res.status(404).json({ message: 'Course not found' });

    const totalAssigned = course.isGlobal
      ? await Employee.countDocuments({ organizationId: req.params.organizationId, isActive: true })
      : course.assignedTo.length;

    const completed = course.completions.filter(c => c.progress === 100 && c.certificateIssued).length;
    const inProgress = course.completions.filter(c => c.progress > 0 && c.progress < 100).length;
    const notStarted = totalAssigned - (completed + inProgress);

    const avgProgress = course.completions.length > 0
      ? Math.round(course.completions.reduce((sum, c) => sum + c.progress, 0) / course.completions.length)
      : 0;

    const avgQuizScore = course.completions.filter(c => c.quizScore !== undefined).length > 0
      ? Math.round(
          course.completions
            .filter(c => c.quizScore !== undefined)
            .reduce((sum, c) => sum + c.quizScore, 0) /
          course.completions.filter(c => c.quizScore !== undefined).length
        )
      : 0;

    res.json({
      statistics: {
        totalAssigned,
        completed,
        inProgress,
        notStarted,
        avgProgress,
        avgQuizScore,
        completions: course.completions
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete course
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const course = await Course.findOneAndDelete({ _id: req.params.id, organizationId: req.params.organizationId });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Also clean up related discussions and assignments
    await CourseDiscussion.deleteMany({ courseId: req.params.id });
    await CourseAssignment.deleteMany({ courseId: req.params.id });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================================
// LMS Enhancement Endpoints
// ============================================================

// Rate a course
router.post('/:orgId/:courseId/rate', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const course = await Course.findOne({ _id: req.params.courseId, organizationId: req.params.orgId });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Check if user already rated, update if so
    const existingRatingIndex = course.ratings.findIndex(
      r => r.userId.toString() === req.user._id.toString()
    );

    if (existingRatingIndex !== -1) {
      course.ratings[existingRatingIndex].rating = rating;
      course.ratings[existingRatingIndex].review = review;
      course.ratings[existingRatingIndex].createdAt = new Date();
    } else {
      course.ratings.push({
        userId: req.user._id,
        rating,
        review,
        createdAt: new Date()
      });
    }

    // Recalculate average rating
    const totalRatings = course.ratings.length;
    const sumRatings = course.ratings.reduce((sum, r) => sum + r.rating, 0);
    course.averageRating = Math.round((sumRatings / totalRatings) * 10) / 10;

    await course.save();
    res.json({
      message: 'Course rated successfully',
      averageRating: course.averageRating,
      totalRatings
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get discussions for a course
router.get('/:orgId/:courseId/discussions', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const discussions = await CourseDiscussion.find({
      courseId: req.params.courseId,
      organizationId: req.params.orgId,
      isDeleted: false
    })
      .populate('userId', 'email')
      .populate('parentId')
      .sort({ createdAt: -1 });

    // Separate top-level posts and replies
    const topLevel = discussions.filter(d => !d.parentId);
    const replies = discussions.filter(d => d.parentId);

    // Attach replies to their parent discussions
    const discussionsWithReplies = topLevel.map(discussion => {
      const discussionObj = discussion.toObject();
      discussionObj.replies = replies.filter(
        r => r.parentId && r.parentId._id.toString() === discussion._id.toString()
      );
      return discussionObj;
    });

    res.json({ discussions: discussionsWithReplies });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create discussion post
router.post('/:orgId/:courseId/discussions', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { content, parentId } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Content is required' });
    }

    // If parentId is provided, validate it exists
    if (parentId) {
      const parentDiscussion = await CourseDiscussion.findById(parentId);
      if (!parentDiscussion) {
        return res.status(404).json({ message: 'Parent discussion not found' });
      }
    }

    const isAdmin = req.user.role === 'orgadmin' || req.user.role === 'superadmin';

    const discussion = await CourseDiscussion.create({
      organizationId: req.params.orgId,
      courseId: req.params.courseId,
      userId: req.user._id,
      content,
      parentId: parentId || undefined,
      isInstructor: isAdmin
    });

    const populated = await CourseDiscussion.findById(discussion._id)
      .populate('userId', 'email');

    res.status(201).json({ discussion: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle like on discussion
router.post('/:orgId/:courseId/discussions/:discussionId/like', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const discussion = await CourseDiscussion.findOne({
      _id: req.params.discussionId,
      courseId: req.params.courseId,
      organizationId: req.params.orgId
    });
    if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

    const userId = req.user._id;
    const likeIndex = discussion.likes.findIndex(
      id => id.toString() === userId.toString()
    );

    if (likeIndex !== -1) {
      // User already liked, remove the like
      discussion.likes.splice(likeIndex, 1);
    } else {
      // Add the like
      discussion.likes.push(userId);
    }

    await discussion.save();
    res.json({
      message: likeIndex !== -1 ? 'Like removed' : 'Like added',
      likesCount: discussion.likes.length,
      liked: likeIndex === -1
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get assignments for a course
router.get('/:orgId/:courseId/assignments', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'orgadmin' || req.user.role === 'superadmin';

    let assignments = await CourseAssignment.find({
      courseId: req.params.courseId,
      organizationId: req.params.orgId
    })
      .populate('submissions.employeeId', 'name email')
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 });

    if (!isAdmin) {
      // Employee: filter submissions to only show their own
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });

      assignments = assignments.map(assignment => {
        const assignmentObj = assignment.toObject();
        assignmentObj.submissions = assignmentObj.submissions.filter(
          s => s.employeeId && s.employeeId._id.toString() === employee._id.toString()
        );
        return assignmentObj;
      });
    }

    res.json({ assignments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create assignment (orgadmin only)
router.post('/:orgId/:courseId/assignments', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { title, description, dueDate, maxScore } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const course = await Course.findOne({ _id: req.params.courseId, organizationId: req.params.orgId });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const assignment = await CourseAssignment.create({
      organizationId: req.params.orgId,
      courseId: req.params.courseId,
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      maxScore: maxScore || 100,
      createdBy: req.user._id
    });

    res.status(201).json({ assignment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Submit assignment (employee)
router.post('/:orgId/:courseId/assignments/:assignmentId/submit', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { content, attachments } = req.body;

    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const assignment = await CourseAssignment.findOne({
      _id: req.params.assignmentId,
      courseId: req.params.courseId,
      organizationId: req.params.orgId
    });
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    // Check if already submitted
    const existingSubmission = assignment.submissions.find(
      s => s.employeeId.toString() === employee._id.toString()
    );

    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted this assignment' });
    }

    assignment.submissions.push({
      employeeId: employee._id,
      content,
      attachments: attachments || [],
      submittedAt: new Date()
    });

    await assignment.save();
    res.status(201).json({
      message: 'Assignment submitted successfully',
      submission: assignment.submissions[assignment.submissions.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Grade submission (orgadmin)
router.put('/:orgId/:courseId/assignments/:assignmentId/grade/:employeeId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { score, feedback } = req.body;

    const assignment = await CourseAssignment.findOne({
      _id: req.params.assignmentId,
      courseId: req.params.courseId,
      organizationId: req.params.orgId
    });
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    const submission = assignment.submissions.find(
      s => s.employeeId.toString() === req.params.employeeId
    );

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found for this employee' });
    }

    if (score !== undefined) {
      if (score < 0 || score > assignment.maxScore) {
        return res.status(400).json({
          message: `Score must be between 0 and ${assignment.maxScore}`
        });
      }
      submission.score = score;
    }

    if (feedback !== undefined) {
      submission.feedback = feedback;
    }

    submission.gradedBy = req.user._id;
    submission.gradedAt = new Date();

    await assignment.save();
    res.json({
      message: 'Submission graded successfully',
      submission
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get/Generate certificate for completed course (employee)
router.get('/:orgId/:courseId/certificate', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const course = await Course.findOne({ _id: req.params.courseId, organizationId: req.params.orgId });
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Find the user's completion record
    const completion = course.completions.find(
      c => c.employeeId.toString() === employee._id.toString()
    );

    if (!completion) {
      return res.status(400).json({ message: 'You have not started this course' });
    }

    // Check if all modules (videos) are completed
    const totalVideos = course.videos.length;
    const allVideosCompleted = totalVideos > 0 && completion.videosCompleted.length >= totalVideos;

    // Check if quiz is passed (if quiz exists)
    const quizPassed = course.quiz.length === 0 || (completion.quizScore && completion.quizScore >= 70);

    if (!allVideosCompleted || !quizPassed) {
      return res.status(400).json({
        message: 'Course not yet completed. Complete all modules and pass the quiz.',
        videosCompleted: completion.videosCompleted.length,
        totalVideos,
        quizScore: completion.quizScore || null,
        quizRequired: course.quiz.length > 0
      });
    }

    // Mark certificate as issued if not already
    if (!completion.certificateIssued) {
      completion.certificateIssued = true;
      completion.completedDate = completion.completedDate || new Date();
      await course.save();
    }

    // Generate certificate data
    const certificateId = `CERT-${course._id.toString().slice(-6).toUpperCase()}-${employee._id.toString().slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    res.json({
      certificate: {
        certificateId,
        courseName: course.title,
        userName: employee.name || req.user.email,
        completionDate: completion.completedDate,
        quizScore: completion.quizScore,
        organizationId: req.params.orgId,
        courseId: req.params.courseId,
        issuedAt: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
