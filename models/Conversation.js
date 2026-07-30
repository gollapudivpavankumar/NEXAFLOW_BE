import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastMessageText: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['direct', 'group', 'channel'],
    default: 'direct'
  },
  name: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  avatar: {
    type: String
  },
  isPrivate: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pinnedMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  // Optional binding to the record this conversation discusses. A Jira
  // Dashboard task thread is just a conversation pinned to that task, which is
  // why task discussion and team chat share one message store instead of being
  // copied between two.
  context: {
    kind: {
      type: String,
      enum: ['taskhub_task', 'taskhub_project', 'taskhub_global'],
      default: undefined
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: undefined
    }
  }
}, {
  timestamps: true
});

// Index for faster lookups
conversationSchema.index({ participants: 1 });
conversationSchema.index({ organizationId: 1, lastMessageAt: -1 });
// One conversation per bound record, per org.
//
// A partial filter rather than `sparse`: a sparse *compound* index still
// indexes any document having at least one of the keyed fields, so every
// ordinary DM and channel (which all have organizationId but no context) would
// index as null/null and collide on the unique constraint after the first one.
// The partial expression indexes only conversations that are actually bound.
conversationSchema.index(
  { organizationId: 1, 'context.kind': 1, 'context.refId': 1 },
  { unique: true, partialFilterExpression: { 'context.kind': { $exists: true } } }
);

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
