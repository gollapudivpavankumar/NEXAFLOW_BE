import express from 'express';
import Meeting from '../models/Meeting.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';
import { createCall, generateUserToken, getApiKey, upsertUser } from '../services/dailyService.js';

const router = express.Router();

// @route   POST /api/meetings/:organizationId
// @desc    Create a new meeting
// @access  Employee, OrgAdmin
router.post('/:organizationId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user._id;
    const { title, description, scheduledAt, duration, callType, participantIds, recurrence, notes, conversationId } = req.body;

    if (!title || !scheduledAt) {
      return res.status(400).json({ message: 'title and scheduledAt are required' });
    }

    // Generate unique meeting link
    const random4 = Math.random().toString(36).substring(2, 6);
    const meetingLink = `meet-${organizationId}-${Date.now()}-${random4}`;

    // Build participants array
    const participants = [];

    // Add creator as accepted participant
    participants.push({
      userId,
      status: 'accepted',
      respondedAt: new Date()
    });

    // Add invited participants
    if (participantIds && Array.isArray(participantIds)) {
      for (const pid of participantIds) {
        // Avoid duplicate if creator is in the list
        if (pid.toString() !== userId.toString()) {
          participants.push({
            userId: pid,
            status: 'invited'
          });
        }
      }
    }

    const meeting = await Meeting.create({
      organizationId,
      title,
      description,
      scheduledAt,
      duration: duration || 30,
      callType: callType || 'video',
      createdBy: userId,
      participants,
      meetingLink,
      recurrence: recurrence || 'none',
      notes,
      conversationId
    });

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.status(201).json({ meeting: populated });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/meetings/:organizationId/upcoming
// @desc    Get upcoming meetings for current user
// @access  Employee, OrgAdmin
// NOTE: This route must be defined before /:organizationId/:meetingId to avoid param conflicts
router.get('/:organizationId/upcoming', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user._id;

    const meetings = await Meeting.find({
      organizationId,
      scheduledAt: { $gte: new Date() },
      status: 'scheduled',
      $or: [
        { createdBy: userId },
        { 'participants.userId': userId }
      ]
    })
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name')
      .sort({ scheduledAt: 1 })
      .limit(10);

    res.json({ meetings });
  } catch (error) {
    console.error('Get upcoming meetings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/meetings/:organizationId
// @desc    List meetings for current user
// @access  Employee, OrgAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user._id;
    const { status, from, to } = req.query;

    const query = {
      organizationId,
      $or: [
        { createdBy: userId },
        { 'participants.userId': userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    if (from || to) {
      query.scheduledAt = {};
      if (from) query.scheduledAt.$gte = new Date(from);
      if (to) query.scheduledAt.$lte = new Date(to);
    }

    const meetings = await Meeting.find(query)
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name')
      .sort({ scheduledAt: 1 });

    res.json({ meetings });
  } catch (error) {
    console.error('List meetings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/meetings/:organizationId/:meetingId
// @desc    Get a single meeting
// @access  Employee, OrgAdmin
router.get('/:organizationId/:meetingId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, meetingId } = req.params;

    const meeting = await Meeting.findOne({ _id: meetingId, organizationId })
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    res.json({ meeting });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/meetings/:organizationId/:meetingId
// @desc    Update a meeting (creator only)
// @access  Employee, OrgAdmin
router.put('/:organizationId/:meetingId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, meetingId } = req.params;
    const userId = req.user._id;
    const { title, description, scheduledAt, duration, notes, status } = req.body;

    const meeting = await Meeting.findOne({ _id: meetingId, organizationId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the meeting creator can update this meeting' });
    }

    if (title !== undefined) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (scheduledAt !== undefined) meeting.scheduledAt = scheduledAt;
    if (duration !== undefined) meeting.duration = duration;
    if (notes !== undefined) meeting.notes = notes;
    if (status !== undefined) meeting.status = status;

    await meeting.save();

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.json({ meeting: populated });
  } catch (error) {
    console.error('Update meeting error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/meetings/:organizationId/:meetingId/respond
// @desc    RSVP to a meeting
// @access  Employee, OrgAdmin
router.put('/:organizationId/:meetingId/respond', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, meetingId } = req.params;
    const userId = req.user._id;
    const { status } = req.body;

    if (!status || !['accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ message: 'status must be accepted, declined, or tentative' });
    }

    const meeting = await Meeting.findOne({ _id: meetingId, organizationId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const participant = meeting.participants.find(
      p => p.userId.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(403).json({ message: 'You are not a participant in this meeting' });
    }

    participant.status = status;
    participant.respondedAt = new Date();

    await meeting.save();

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.json({ meeting: populated });
  } catch (error) {
    console.error('RSVP meeting error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/meetings/:organizationId/:meetingId/start
// @desc    Start a meeting (creates Stream call)
// @access  Employee, OrgAdmin
router.post('/:organizationId/:meetingId/start', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findOne({ _id: meetingId, organizationId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot start a cancelled meeting' });
    }

    if (meeting.status === 'ended') {
      return res.status(400).json({ message: 'Meeting has already ended' });
    }

    const callId = meeting.meetingLink;

    // Upsert caller on Stream
    await upsertUser(userId.toString(), req.user.name || req.user.email);

    // Get participant user IDs
    const participantUserIds = meeting.participants
      .map(p => p.userId.toString())
      .filter(p => p !== userId.toString());

    // Create the Stream call
    await createCall(callId, userId.toString(), participantUserIds);

    // Generate token for the caller
    const userToken = generateUserToken(userId.toString());

    // Update meeting status
    meeting.status = 'active';
    meeting.streamCallId = callId;
    await meeting.save();

    res.json({
      callId,
      token: userToken,
      apiKey: getApiKey()
    });
  } catch (error) {
    console.error('Start meeting error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/meetings/:organizationId/:meetingId/end
// @desc    End a meeting
// @access  Employee, OrgAdmin
router.put('/:organizationId/:meetingId/end', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, meetingId } = req.params;

    const meeting = await Meeting.findOne({ _id: meetingId, organizationId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    meeting.status = 'ended';
    await meeting.save();

    const populated = await Meeting.findById(meeting._id)
      .populate('createdBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.json({ meeting: populated });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/meetings/:organizationId/:meetingId
// @desc    Cancel a meeting (creator only)
// @access  Employee, OrgAdmin
router.delete('/:organizationId/:meetingId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findOne({ _id: meetingId, organizationId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (meeting.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the meeting creator can cancel this meeting' });
    }

    meeting.status = 'cancelled';
    await meeting.save();

    res.json({ message: 'Meeting cancelled', meeting });
  } catch (error) {
    console.error('Cancel meeting error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

export default router;
