import mongoose from 'mongoose';

const shiftTemplateSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  breakDuration: {
    type: Number,
    default: 60
  },
  breakStartTime: {
    type: String
  },
  color: {
    type: String,
    default: '#667eea'
  },
  isOvernight: {
    type: Boolean,
    default: false
  },
  totalHours: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

shiftTemplateSchema.index({ organizationId: 1, isActive: 1 });

const ShiftTemplate = mongoose.model('ShiftTemplate', shiftTemplateSchema);
export default ShiftTemplate;
