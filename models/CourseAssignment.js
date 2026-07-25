import mongoose from 'mongoose';

const courseAssignmentSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  dueDate: {
    type: Date
  },
  maxScore: {
    type: Number,
    default: 100
  },
  submissions: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    submittedAt: { type: Date, default: Date.now },
    content: { type: String },
    attachments: [{
      filename: { type: String },
      fileData: { type: String },
      fileType: { type: String },
      fileSize: { type: Number }
    }],
    score: { type: Number },
    feedback: { type: String },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gradedAt: { type: Date }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

courseAssignmentSchema.index({ organizationId: 1, courseId: 1 });

const CourseAssignment = mongoose.model('CourseAssignment', courseAssignmentSchema);
export default CourseAssignment;
