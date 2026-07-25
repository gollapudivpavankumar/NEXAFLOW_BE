import mongoose from 'mongoose';

const leaveTypeSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Leave type name is required'],
    trim: true
  },
  daysPerYear: {
    type: Number,
    required: [true, 'Days per year is required'],
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
leaveTypeSchema.index({ organizationId: 1, name: 1 });

const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

export default LeaveType;
