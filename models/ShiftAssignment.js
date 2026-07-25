import mongoose from 'mongoose';

const shiftAssignmentSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  shiftTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate',
    required: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  actualStartTime: {
    type: Date
  },
  actualEndTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'missed', 'swapped'],
    default: 'scheduled'
  },
  overtimeHours: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

shiftAssignmentSchema.index({ organizationId: 1, date: 1 });
shiftAssignmentSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const ShiftAssignment = mongoose.model('ShiftAssignment', shiftAssignmentSchema);
export default ShiftAssignment;
