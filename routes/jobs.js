import express from 'express';
import Job from '../models/Job.js';
import Organization from '../models/Organization.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/jobs/:organizationId
// @desc    Get all jobs for an organization
// @access  Private/OrgAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const jobs = await Job.find({ organizationId })
      .populate('postedBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ jobs });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/jobs/public/:organizationId
// @desc    Get active jobs for public careers page
// @access  Public
router.get('/public/:organizationId/active', async (req, res) => {
  try {
    const { organizationId } = req.params;

    const jobs = await Job.find({
      organizationId,
      status: 'active',
      isActive: true
    })
      .select('-postedBy -applicationCount')
      .sort({ publishedDate: -1 });

    const organization = await Organization.findById(organizationId)
      .select('name logo email phone addressLine1 addressLine2');

    res.json({ jobs, organization });
  } catch (error) {
    console.error('Get public jobs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/jobs/:organizationId/:id
// @desc    Get single job details
// @access  Private/OrgAdmin
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const job = await Job.findOne({ _id: id, organizationId })
      .populate('postedBy', 'email');

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({ job });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/jobs/public/:organizationId/:id
// @desc    Get single job details for public
// @access  Public
router.get('/public/:organizationId/:id/details', async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const job = await Job.findOne({
      _id: id,
      organizationId,
      status: 'active',
      isActive: true
    }).select('-postedBy -applicationCount');

    if (!job) {
      return res.status(404).json({ message: 'Job not found or no longer available' });
    }

    const organization = await Organization.findById(organizationId)
      .select('name logo email phone addressLine1 addressLine2 description');

    res.json({ job, organization });
  } catch (error) {
    console.error('Get public job details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/jobs/public/:organizationId/job/:jobId
// @desc    Get single job details for public careers page
// @access  Public
router.get('/public/:organizationId/job/:jobId', async (req, res) => {
  try {
    const { organizationId, jobId } = req.params;

    const job = await Job.findOne({
      _id: jobId,
      organizationId,
      status: 'active',
      isActive: true
    }).select('-postedBy -applicationCount');

    if (!job) {
      return res.status(404).json({ message: 'Job not found or no longer available' });
    }

    const organization = await Organization.findById(organizationId)
      .select('name logo email phone addressLine1 addressLine2 description');

    res.json({ job, organization });
  } catch (error) {
    console.error('Get public job details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/jobs/:organizationId
// @desc    Create a new job
// @access  Private/OrgAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const jobData = {
      ...req.body,
      organizationId,
      postedBy: req.user._id
    };

    // If status is being set to active, set publishedDate
    if (jobData.status === 'active' && !jobData.publishedDate) {
      jobData.publishedDate = new Date();
    }

    const job = await Job.create(jobData);

    res.status(201).json({
      message: 'Job created successfully',
      job
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/jobs/:organizationId/:id
// @desc    Update a job
// @access  Private/OrgAdmin
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const job = await Job.findOne({ _id: id, organizationId });

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // If status is being changed to active and no publishedDate, set it
    if (req.body.status === 'active' && !job.publishedDate) {
      req.body.publishedDate = new Date();
    }

    const updatedJob = await Job.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('postedBy', 'email');

    res.json({
      message: 'Job updated successfully',
      job: updatedJob
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/jobs/:organizationId/:id
// @desc    Delete a job
// @access  Private/OrgAdmin
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    const job = await Job.findOne({ _id: id, organizationId });

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    await Job.findByIdAndDelete(id);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/jobs/:organizationId/:id/status
// @desc    Update job status
// @access  Private/OrgAdmin
router.put('/:organizationId/:id/status', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { status } = req.body;

    const job = await Job.findOne({ _id: id, organizationId });

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const updateData = { status };

    // If activating and no publishedDate, set it
    if (status === 'active' && !job.publishedDate) {
      updateData.publishedDate = new Date();
    }

    const updatedJob = await Job.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    res.json({
      message: 'Job status updated successfully',
      job: updatedJob
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
