import mongoose from 'mongoose';

const jobApplicationSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  // Applicant details
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  resumeUrl: {
    type: String,
    default: ''
  },
  resumeBase64: {
    type: String,
    default: ''
  },
  coverLetter: {
    type: String,
    default: ''
  },
  linkedinUrl: {
    type: String,
    trim: true,
    default: ''
  },
  portfolioUrl: {
    type: String,
    trim: true,
    default: ''
  },
  currentCompany: {
    type: String,
    trim: true,
    default: ''
  },
  currentPosition: {
    type: String,
    trim: true,
    default: ''
  },
  yearsOfExperience: {
    type: Number,
    default: 0
  },
  expectedSalary: {
    type: Number,
    default: 0
  },
  noticePeriod: {
    type: String,
    default: ''
  },
  // Application status
  status: {
    type: String,
    enum: ['new', 'reviewing', 'shortlisted', 'interviewed', 'offered', 'rejected', 'withdrawn'],
    default: 'new'
  },
  notes: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedDate: {
    type: Date,
    default: null
  },
  // Additional fields
  customFields: {
    type: Map,
    of: String,
    default: {}
  },
  source: {
    type: String,
    default: 'website'
  },
  ipAddress: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for better query performance
jobApplicationSchema.index({ jobId: 1, status: 1 });
jobApplicationSchema.index({ organizationId: 1, status: 1 });
jobApplicationSchema.index({ email: 1 });

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

export default JobApplication;
