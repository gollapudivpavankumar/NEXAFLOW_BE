import express from 'express';
import mongoose from 'mongoose';
import JobApplication from '../models/JobApplication.js';
import Job from '../models/Job.js';
import Organization from '../models/Organization.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import { sendApplicationNotificationToAdmin, sendApplicationConfirmationToApplicant, sendApplicationStatusUpdate } from '../services/emailService.js';

const router = express.Router();

// @route   GET /api/job-applications/:organizationId
// @desc    Get all job applications for an organization
// @access  Private/OrgAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { jobId, status } = req.query;

    const query = { organizationId };

    if (jobId) {
      query.jobId = jobId;
    }

    if (status) {
      query.status = status;
    }

    const applications = await JobApplication.find(query)
      .populate('jobId', 'title department location')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ applications });
  } catch (error) {
    console.error('Get job applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/job-applications/:organizationId/:id
// @desc    Get single job application details
// @access  Private/OrgAdmin
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const application = await JobApplication.findOne({ _id: id, organizationId })
      .populate('jobId', 'title department location employmentType')
      .populate('reviewedBy', 'email');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json({ application });
  } catch (error) {
    console.error('Get application details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/job-applications/public/:organizationId/:jobId
// @desc    Submit a job application (public)
// @access  Public
router.post('/public/:organizationId/:jobId', async (req, res) => {
  try {
    const { organizationId, jobId } = req.params;

    // Check if job exists and is active
    const job = await Job.findOne({
      _id: jobId,
      organizationId,
      status: 'active',
      isActive: true
    });

    if (!job) {
      return res.status(404).json({ message: 'Job not found or no longer accepting applications' });
    }

    // Create application
    const applicationData = {
      ...req.body,
      jobId,
      organizationId,
      ipAddress: req.ip || req.connection.remoteAddress
    };

    const application = await JobApplication.create(applicationData);

    // Increment application count on job
    await Job.findByIdAndUpdate(jobId, {
      $inc: { applicationCount: 1 }
    });

    // Get organization details for email
    const organization = await Organization.findById(organizationId);

    // Send email notifications (non-blocking)
    if (organization && job) {
      // Send confirmation to applicant
      sendApplicationConfirmationToApplicant(application, job, organization).catch(err => {
        console.error('Failed to send confirmation email to applicant:', err);
      });

      // Send notification to admin
      sendApplicationNotificationToAdmin(application, job, organization).catch(err => {
        console.error('Failed to send notification email to admin:', err);
      });
    }

    res.status(201).json({
      message: 'Application submitted successfully! We will review your application and get back to you soon.',
      application: {
        id: application._id,
        fullName: application.fullName,
        email: application.email,
        submittedAt: application.createdAt
      }
    });
  } catch (error) {
    console.error('Submit application error:', error);
    res.status(500).json({ message: 'Failed to submit application. Please try again.' });
  }
});

// @route   PUT /api/job-applications/:organizationId/:id/status
// @desc    Update application status
// @access  Private/OrgAdmin
router.put('/:organizationId/:id/status', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { status, notes } = req.body;

    const application = await JobApplication.findOne({ _id: id, organizationId });

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const updateData = {
      status,
      reviewedBy: req.user._id,
      reviewedDate: new Date()
    };

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const updatedApplication = await JobApplication.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).populate('jobId', 'title department location employmentType')
      .populate('reviewedBy', 'email');

    // Send status update email to applicant (non-blocking)
    const organization = await Organization.findById(organizationId);
    if (organization && updatedApplication.jobId) {
      sendApplicationStatusUpdate(updatedApplication, updatedApplication.jobId, organization, status).catch(err => {
        console.error('Failed to send status update email:', err);
      });
    }

    res.json({
      message: 'Application status updated successfully',
      application: updatedApplication
    });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/job-applications/:organizationId/:id/rating
// @desc    Update application rating
// @access  Private/OrgAdmin
router.put('/:organizationId/:id/rating', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { rating } = req.body;

    if (rating < 0 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 0 and 5' });
    }

    const application = await JobApplication.findOne({ _id: id, organizationId });

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const updatedApplication = await JobApplication.findByIdAndUpdate(
      id,
      { $set: { rating } },
      { new: true }
    );

    res.json({
      message: 'Application rating updated successfully',
      application: updatedApplication
    });
  } catch (error) {
    console.error('Update application rating error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/job-applications/:organizationId/:id/notes
// @desc    Update application notes
// @access  Private/OrgAdmin
router.put('/:organizationId/:id/notes', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { notes } = req.body;

    const application = await JobApplication.findOne({ _id: id, organizationId });

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const updatedApplication = await JobApplication.findByIdAndUpdate(
      id,
      { $set: { notes } },
      { new: true }
    );

    res.json({
      message: 'Application notes updated successfully',
      application: updatedApplication
    });
  } catch (error) {
    console.error('Update application notes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/job-applications/:organizationId/:id
// @desc    Delete a job application
// @access  Private/OrgAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const application = await JobApplication.findOne({ _id: id, organizationId });

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Decrement application count on job
    await Job.findByIdAndUpdate(application.jobId, {
      $inc: { applicationCount: -1 }
    });

    await JobApplication.findByIdAndDelete(id);

    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/job-applications/:organizationId/stats
// @desc    Get application statistics
// @access  Private/OrgAdmin
router.get('/:organizationId/stats/overview', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const totalApplications = await JobApplication.countDocuments({ organizationId });
    const newApplications = await JobApplication.countDocuments({ organizationId, status: 'new' });
    const shortlisted = await JobApplication.countDocuments({ organizationId, status: 'shortlisted' });
    const interviewed = await JobApplication.countDocuments({ organizationId, status: 'interviewed' });
    const offered = await JobApplication.countDocuments({ organizationId, status: 'offered' });

    const statusBreakdown = await JobApplication.aggregate([
      { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      stats: {
        total: totalApplications,
        new: newApplications,
        shortlisted,
        interviewed,
        offered,
        statusBreakdown
      }
    });
  } catch (error) {
    console.error('Get application stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
