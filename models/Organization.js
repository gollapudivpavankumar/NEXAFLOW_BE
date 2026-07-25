import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    unique: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  logo: {
    type: String,
    trim: true,
    default: ''
  },
  addressLine1: {
    type: String,
    trim: true,
    default: ''
  },
  addressLine2: {
    type: String,
    trim: true,
    default: ''
  },
  bankName: {
    type: String,
    trim: true,
    default: ''
  },
  bankTransit: {
    type: String,
    trim: true,
    default: ''
  },
  // SMTP Settings for sending emails
  smtpHost: {
    type: String,
    trim: true,
    default: ''
  },
  smtpPort: {
    type: Number,
    default: 587
  },
  smtpSecure: {
    type: Boolean,
    default: false
  },
  smtpUser: {
    type: String,
    trim: true,
    default: ''
  },
  smtpPassword: {
    type: String,
    default: ''
  },
  smtpFromEmail: {
    type: String,
    trim: true,
    default: ''
  },
  smtpFromName: {
    type: String,
    trim: true,
    default: ''
  },
  cpanelHost: {
    type: String,
    trim: true,
    default: ''
  },
  cpanelPort: {
    type: Number,
    default: 2083
  },
  cpanelUsername: {
    type: String,
    trim: true,
    default: ''
  },
  cpanelApiToken: {
    type: String,
    default: ''
  },
  cpanelDomain: {
    type: String,
    trim: true,
    default: ''
  },
  themeColor: {
    type: String,
    trim: true,
    default: ''
  },
  // Organization profile / identity fields
  slug: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true
  },
  code: {
    type: String,
    trim: true,
    default: ''
  },
  shortCode: {
    type: String,
    trim: true,
    default: ''
  },
  industry: {
    type: String,
    trim: true,
    default: ''
  },
  companySize: {
    type: String,
    trim: true,
    default: ''
  },
  foundedYear: {
    type: Number,
    default: null
  },
  website: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  // Location fields
  city: {
    type: String,
    trim: true,
    default: ''
  },
  province: {
    type: String,
    trim: true,
    default: ''
  },
  postalCode: {
    type: String,
    trim: true,
    default: ''
  },
  // Financial & legal fields
  currency: {
    type: String,
    trim: true,
    default: 'CAD'
  },
  fiscalYearStartMonth: {
    type: Number,
    default: 1
  },
  taxId: {
    type: String,
    trim: true,
    default: ''
  },
  registrationNumber: {
    type: String,
    trim: true,
    default: ''
  },
  timezone: {
    type: String,
    trim: true,
    default: 'America/Toronto'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Subscription fields
  subscriptionStatus: {
    type: String,
    enum: ['active', 'trial', 'expired', 'suspended', 'cancelled'],
    default: 'active'
  },
  subscriptionPlan: {
    type: String,
    enum: ['starter', 'professional', 'enterprise', 'legacy'],
    default: 'legacy'
  },
  subscriptionDuration: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly', 'lifetime'],
    default: 'lifetime'
  },
  subscriptionStartDate: {
    type: Date,
    default: null
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  employeeLimit: {
    type: Number,
    default: 9999 // Default unlimited for legacy organizations
  },
  lastPaymentDate: {
    type: Date,
    default: null
  },
  lastPaymentAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for faster lookups
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ subscriptionStatus: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
