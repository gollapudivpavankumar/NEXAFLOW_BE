import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  eventType: {
    type: String,
    enum: ['meeting', 'reminder', 'deadline', 'training', 'review', 'other'],
    default: 'meeting'
  },
  startDate: {
    type: Date,
    required: true,
    index: true
  },
  endDate: {
    type: Date,
    required: true
  },
  allDay: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    trim: true
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  meetingLink: {
    type: String
  },
  callLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallLog'
  },
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'tentative'], default: 'pending' },
    respondedAt: { type: Date }
  }],
  recurrence: {
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] },
    interval: { type: Number, default: 1 },
    endDate: { type: Date },
    daysOfWeek: [{ type: Number }],
    parentEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent' }
  },
  reminders: [{
    type: { type: String, enum: ['email', 'notification'], default: 'notification' },
    minutesBefore: { type: Number, default: 15 }
  }],
  color: {
    type: String,
    default: '#667eea'
  },
  isPrivate: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

calendarEventSchema.index({ organizationId: 1, startDate: 1, endDate: 1 });
calendarEventSchema.index({ 'participants.userId': 1, startDate: 1 });
calendarEventSchema.index({ createdBy: 1, startDate: 1 });

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export default CalendarEvent;
