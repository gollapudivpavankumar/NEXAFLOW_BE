import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  category: {
    type: String,
    enum: ['Technical', 'Soft Skills', 'Compliance', 'Leadership', 'Sales', 'Product', 'Other'],
    default: 'Other'
  },
  thumbnail: String,
  duration: Number, // in minutes
  isGlobal: {
    type: Boolean,
    default: false
  },
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }],
  videos: [{
    title: String,
    description: String,
    videoUrl: String,
    duration: Number,
    order: Number
  }],
  materials: [{
    title: String,
    fileUrl: String,
    fileType: String
  }],
  quiz: [{
    question: String,
    options: [String],
    correctAnswer: Number
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  completions: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    completedDate: Date,
    progress: {
      type: Number,
      default: 0
    },
    videosCompleted: [Number],
    quizScore: Number,
    certificateIssued: Boolean
  }],
  tags: [{
    type: String
  }],
  difficulty: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner'
  },
  instructor: {
    type: String
  },
  dueDate: {
    type: Date
  },
  ratings: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    review: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  enrolledUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

courseSchema.index({ organizationId: 1, isActive: 1 });
courseSchema.index({ isGlobal: 1 });

const Course = mongoose.model('Course', courseSchema);

export default Course;
