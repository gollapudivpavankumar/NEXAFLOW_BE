import mongoose from 'mongoose';

const callLogSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  callType: {
    type: String,
    enum: ['audio', 'video', 'screen_share'],
    required: true
  },
  streamCallId: {
    type: String
  },
  streamCallType: {
    type: String,
    default: 'default'
  },
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
    leftAt: { type: Date },
    duration: { type: Number }
  }],
  status: {
    type: String,
    enum: ['ringing', 'active', 'ended', 'missed', 'rejected'],
    default: 'ringing'
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

callLogSchema.index({ organizationId: 1, createdAt: -1 });
callLogSchema.index({ conversationId: 1, createdAt: -1 });

const CallLog = mongoose.model('CallLog', callLogSchema);
export default CallLog;
