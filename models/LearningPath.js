import mongoose from 'mongoose';

const learningPathSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  courses: [{
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    order: { type: Number, required: true },
    isRequired: { type: Boolean, default: true }
  }],
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }],
  isGlobal: {
    type: Boolean,
    default: false
  },
  estimatedDuration: {
    type: Number
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

learningPathSchema.index({ organizationId: 1, isActive: 1 });

const LearningPath = mongoose.model('LearningPath', learningPathSchema);
export default LearningPath;
