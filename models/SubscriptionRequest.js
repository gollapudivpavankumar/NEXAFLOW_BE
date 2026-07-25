import mongoose from 'mongoose';

const subscriptionRequestSchema = new mongoose.Schema({
  // Organization/Company Information
  organizationName: {
    type: String,
    required: [true, 'Organization name is required'],
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
  contactName: {
    type: String,
    required: [true, 'Contact person name is required'],
    trim: true
  },

  // Address
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
  country: {
    type: String,
    trim: true,
    default: 'Canada'
  },

  // Subscription Plan
  planType: {
    type: String,
    enum: ['starter', 'professional', 'enterprise'],
    default: 'starter'
  },
  planDuration: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    default: 'monthly'
  },
  employeeCount: {
    type: String,
    enum: ['1-10', '11-25', '26-50', '51-100', '100+'],
    default: '1-10'
  },

  // E-Transfer Payment Details
  eTransferReference: {
    type: String,
    trim: true,
    default: ''
  },
  eTransferSenderName: {
    type: String,
    trim: true,
    default: ''
  },
  eTransferSenderEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  eTransferAmount: {
    type: Number,
    default: 0
  },
  eTransferDate: {
    type: Date,
    default: null
  },
  paymentNotes: {
    type: String,
    trim: true,
    default: ''
  },

  // Request Status
  status: {
    type: String,
    enum: ['pending', 'payment_received', 'verified', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },

  // Admin Notes
  adminNotes: {
    type: String,
    trim: true,
    default: ''
  },

  // Reference to created organization (if approved)
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },

  // Processing Info
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },

  // Subscription dates (set when approved)
  subscriptionStartDate: {
    type: Date,
    default: null
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
subscriptionRequestSchema.index({ email: 1 });
subscriptionRequestSchema.index({ status: 1 });
subscriptionRequestSchema.index({ createdAt: -1 });

const SubscriptionRequest = mongoose.model('SubscriptionRequest', subscriptionRequestSchema);

export default SubscriptionRequest;
