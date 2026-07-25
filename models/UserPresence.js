import mongoose from 'mongoose';

const userPresenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  currentCallId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallLog'
  }
}, { timestamps: true });

const UserPresence = mongoose.model('UserPresence', userPresenceSchema);
export default UserPresence;
