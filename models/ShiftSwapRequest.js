import mongoose from 'mongoose';

const shiftSwapRequestSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  requesterAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftAssignment',
    required: true
  },
  targetEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  targetAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftAssignment',
    required: true
  },
  reason: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending_peer', 'pending_admin', 'approved', 'rejected', 'cancelled'],
    default: 'pending_peer'
  },
  peerApproved: {
    type: Boolean,
    default: false
  },
  peerApprovedDate: {
    type: Date
  },
  adminApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminApprovedDate: {
    type: Date
  },
  comments: {
    type: String
  }
}, { timestamps: true });

shiftSwapRequestSchema.index({ organizationId: 1, status: 1 });

const ShiftSwapRequest = mongoose.model('ShiftSwapRequest', shiftSwapRequestSchema);
export default ShiftSwapRequest;
