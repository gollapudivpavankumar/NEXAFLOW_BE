import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
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
  scheduledAt: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    default: 30
  },
  callType: {
    type: String,
    enum: ['audio', 'video', 'screen_share'],
    default: 'video'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['invited', 'accepted', 'declined', 'tentative'],
      default: 'invited'
    },
    respondedAt: {
      type: Date
    }
  }],
  meetingLink: {
    type: String,
    unique: true
  },
  streamCallId: {
    type: String
  },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  recurrence: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'],
    default: 'none'
  },
  recurrenceEndDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  }
}, { timestamps: true });

meetingSchema.index({ organizationId: 1, scheduledAt: 1 });
meetingSchema.index({ meetingLink: 1 }, { unique: true });

const Meeting = mongoose.model('Meeting', meetingSchema);
export default Meeting;
