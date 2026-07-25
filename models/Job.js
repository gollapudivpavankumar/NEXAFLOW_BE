import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true
  },
  department: {
    type: String,
    trim: true,
    default: ''
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  employmentType: {
    type: String,
    enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'],
    default: 'Full-time'
  },
  salaryRange: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    currency: { type: String, default: 'CAD' }
  },
  description: {
    type: String,
    required: [true, 'Job description is required']
  },
  requirements: {
    type: String,
    default: ''
  },
  responsibilities: {
    type: String,
    default: ''
  },
  benefits: {
    type: String,
    default: ''
  },
  experience: {
    type: String,
    default: ''
  },
  education: {
    type: String,
    default: ''
  },
  skills: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['draft', 'active', 'closed', 'paused'],
    default: 'draft'
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  publishedDate: {
    type: Date,
    default: null
  },
  closingDate: {
    type: Date,
    default: null
  },
  applicationCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isRemote: {
    type: Boolean,
    default: false
  },
  openings: {
    type: Number,
    default: 1
  },
  applicationDeadline: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
jobSchema.index({ organizationId: 1, status: 1 });
jobSchema.index({ status: 1, isActive: 1 });

const Job = mongoose.model('Job', jobSchema);

export default Job;
