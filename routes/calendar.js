import express from 'express';
import CalendarEvent from '../models/CalendarEvent.js';
import LeaveRequest from '../models/LeaveRequest.js';
import ShiftAssignment from '../models/ShiftAssignment.js';
import Notification from '../models/Notification.js';
import { protect, employeeOrOrgAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import { createCall, generateUserToken, getApiKey, upsertUser } from '../services/dailyService.js';

const router = express.Router();

// @route   GET /api/calendar/:organizationId/events
// @desc    Get all events with optional date range filter (query: start/startDate, end/endDate)
// @access  Protected
router.get('/:organizationId/events', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const start = req.query.start || req.query.startDate;
    const end = req.query.end || req.query.endDate;
    const query = { organizationId: req.params.organizationId };

    if (start && end) {
      query.$or = [
        { startDate: { $gte: new Date(start), $lte: new Date(end) } },
        { endDate: { $gte: new Date(start), $lte: new Date(end) } },
        { startDate: { $lte: new Date(start) }, endDate: { $gte: new Date(end) } }
      ];
    } else if (start) {
      query.startDate = { $gte: new Date(start) };
    } else if (end) {
      query.endDate = { $lte: new Date(end) };
    }

    const events = await CalendarEvent.find(query)
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email')
      .sort({ startDate: 1 });

    res.json({ events });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/calendar/:organizationId/my-events
// @desc    Get events where current user is a participant or the creator
// @access  Employee, OrgAdmin
router.get('/:organizationId/my-events', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const start = req.query.start || req.query.startDate;
    const end = req.query.end || req.query.endDate;
    const query = {
      organizationId: req.params.organizationId,
      $or: [
        { createdBy: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    };

    if (start && end) {
      // Use $and to avoid overwriting the $or filter for user ownership
      query.$and = [
        { startDate: { $lte: new Date(end) } },
        { endDate: { $gte: new Date(start) } }
      ];
    } else if (start) {
      query.startDate = { $gte: new Date(start) };
    } else if (end) {
      query.endDate = { $lte: new Date(end) };
    }

    const events = await CalendarEvent.find(query)
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email')
      .sort({ startDate: 1 });

    res.json({ events });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/calendar/:organizationId/leave-overlay
// @desc    Get approved leave requests for date range as calendar overlay data
// @access  Protected
router.get('/:organizationId/leave-overlay', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const start = req.query.start || req.query.startDate;
    const end = req.query.end || req.query.endDate;
    const query = {
      organizationId: req.params.organizationId,
      status: 'approved'
    };

    if (start && end) {
      query.$or = [
        { startDate: { $gte: new Date(start), $lte: new Date(end) } },
        { endDate: { $gte: new Date(start), $lte: new Date(end) } },
        { startDate: { $lte: new Date(start) }, endDate: { $gte: new Date(end) } }
      ];
    }

    const leaves = await LeaveRequest.find(query)
      .populate('employeeId', 'name email')
      .populate('leaveTypeId', 'name');

    const leaveEvents = leaves.map(leave => ({
      _id: leave._id,
      title: `${leave.employeeId ? leave.employeeId.name : 'Employee'} - Leave`,
      startDate: leave.startDate,
      endDate: leave.endDate,
      leaveType: leave.leaveTypeId ? leave.leaveTypeId.name : null,
      color: '#ff4d4f',
      allDay: true,
      type: 'leave'
    }));

    res.json({ leaves: leaveEvents });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/calendar/:organizationId/shift-overlay
// @desc    Get shift assignments for date range as calendar overlay data
// @access  Protected
router.get('/:organizationId/shift-overlay', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const start = req.query.start || req.query.startDate;
    const end = req.query.end || req.query.endDate;
    const query = { organizationId: req.params.organizationId };

    if (start && end) {
      query.date = {
        $gte: new Date(start),
        $lte: new Date(end)
      };
    }

    const assignments = await ShiftAssignment.find(query)
      .populate('employeeId', 'name email')
      .populate('shiftTemplateId', 'name startTime endTime color');

    const shiftEvents = assignments.map(assignment => ({
      _id: assignment._id,
      title: `${assignment.employeeId ? assignment.employeeId.name : 'Employee'} - ${assignment.shiftTemplateId ? assignment.shiftTemplateId.name : 'Shift'}`,
      startDate: assignment.date,
      endDate: assignment.date,
      color: assignment.shiftTemplateId ? assignment.shiftTemplateId.color : '#667eea',
      allDay: true,
      type: 'shift',
      shiftDetails: assignment.shiftTemplateId ? {
        startTime: assignment.shiftTemplateId.startTime,
        endTime: assignment.shiftTemplateId.endTime
      } : null
    }));

    res.json({ shifts: shiftEvents });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/calendar/:organizationId/events/:id
// @desc    Get a single calendar event by ID
// @access  Protected
router.get('/:organizationId/events/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    })
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ event });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/calendar/:organizationId/events
// @desc    Create a new calendar event
// @access  Employee, OrgAdmin
router.post('/:organizationId/events', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { title, startDate, endDate } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ message: 'title, startDate, and endDate are required' });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ message: 'endDate cannot be before startDate' });
    }

    const { _id, ...eventData } = req.body;
    const event = await CalendarEvent.create({
      ...eventData,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });

    // Notify each participant about the new event
    if (event.participants && event.participants.length > 0) {
      const notifications = event.participants
        .filter(p => p.userId && p.userId.toString() !== req.user._id.toString())
        .map(p => ({
          userId: p.userId,
          organizationId: req.params.organizationId,
          type: 'calendar',
          title: 'New Calendar Event',
          message: `You have been invited to: ${title}`,
          relatedId: event._id
        }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }

    const populated = await CalendarEvent.findById(event._id)
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email');

    res.status(201).json({ event: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/calendar/:organizationId/events/:id
// @desc    Update a calendar event (only the creator can update)
// @access  Protected
router.put('/:organizationId/events/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the event creator can update this event' });
    }

    // Prevent overwriting immutable fields
    const { organizationId: _orgId, createdBy: _creator, _id, ...updateData } = req.body;

    const updatedEvent = await CalendarEvent.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email');

    res.json({ event: updatedEvent });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/calendar/:organizationId/events/:id
// @desc    Delete a calendar event (only the creator can delete)
// @access  Protected
router.delete('/:organizationId/events/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the event creator can delete this event' });
    }

    await CalendarEvent.findByIdAndDelete(req.params.id);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/calendar/:organizationId/events/:id/rsvp
// @desc    RSVP to a calendar event (accepted or declined)
// @access  Protected
router.put('/:organizationId/events/:id/rsvp', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ message: 'Valid status (accepted/declined/tentative) is required' });
    }

    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const participantIndex = event.participants.findIndex(
      p => p.userId && p.userId.toString() === req.user._id.toString()
    );

    if (participantIndex === -1) {
      return res.status(400).json({ message: 'You are not a participant of this event' });
    }

    event.participants[participantIndex].status = status;
    event.participants[participantIndex].respondedAt = new Date();
    await event.save();

    const populated = await CalendarEvent.findById(event._id)
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email');

    res.json({ event: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/calendar/:organizationId/events/:id/meeting-link
// @desc    Generate a GetStream Video call for a virtual event
// @access  Protected
router.post('/:organizationId/events/:id/meeting-link', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isVirtual) {
      return res.status(400).json({ message: 'Event is not marked as virtual' });
    }

    // Generate a unique call ID from the event ID
    const callId = `event-${event._id}`;
    const creatorId = req.user._id.toString();

    // Upsert the creator on Stream
    await upsertUser(creatorId, req.user.name || req.user.email);

    // Get participant user IDs
    const participantUserIds = event.participants
      .filter(p => p.userId && p.userId.toString() !== creatorId)
      .map(p => p.userId.toString());

    // Create the Stream call
    const streamCall = await createCall(callId, creatorId, participantUserIds);

    // Generate token for the requesting user
    const userToken = generateUserToken(creatorId);

    // Store the call ID as the meeting link reference
    event.meetingLink = callId;
    await event.save();

    const populated = await CalendarEvent.findById(event._id)
      .populate('createdBy', 'email')
      .populate('participants.userId', 'email');

    res.json({
      event: populated,
      callId,
      token: userToken,
      apiKey: getApiKey()
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
