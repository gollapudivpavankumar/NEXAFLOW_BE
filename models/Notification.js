import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  // Who caused this notification. Null for system-generated ones.
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  type: {
    type: String,
    enum: [
      // HRM / ERP
      'message', 'leave', 'payment', 'task', 'system', 'announcement',
      'loan', 'shift', 'offboarding', 'calendar', 'course', 'call', 'email',
      // Jira Dashboard. Kept in the same collection so both products feed one
      // inbox rather than each maintaining its own notification store.
      'task_assigned', 'task_ready', 'task_approved', 'task_reopened',
      'mention', 'task_moved', 'project_invite', 'project_updated'
    ],
    required: true
  },
  // Which product raised it, so a UI can filter to just its own.
  source: {
    type: String,
    enum: ['hrm', 'taskhub'],
    default: 'hrm',
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  link: {
    type: String
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId
  },
  // Typed references for the Jira Dashboard, which needs to deep-link to a
  // task, project or message independently rather than to one opaque id.
  context: {
    taskId: { type: mongoose.Schema.Types.ObjectId, default: null },
    projectId: { type: mongoose.Schema.Types.ObjectId, default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for faster lookups
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, source: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
