import mongoose from 'mongoose';
import crypto from 'crypto';

const offerLetterSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OfferLetterTemplate'
  },
  employeeName: {
    type: String,
    required: true
  },
  employeeEmail: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  salary: {
    type: Number,
    required: true
  },
  joiningDate: {
    type: Date,
    required: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'viewed', 'signed', 'declined'],
    default: 'pending'
  },
  signatureToken: {
    type: String,
    unique: true,
    default: function() {
      return crypto.randomBytes(32).toString('hex');
    }
  },
  signature: {
    type: String, // Base64 signature image
    default: null
  },
  signedDate: {
    type: Date,
    default: null
  },
  signedIp: {
    type: String,
    default: null
  },
  viewedDate: {
    type: Date,
    default: null
  },
  sentDate: {
    type: Date,
    default: Date.now
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expiryDate: {
    type: Date,
    required: true,
    default: function() {
      // Default expiry: 30 days from now
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  additionalData: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Index for faster lookups
offerLetterSchema.index({ signatureToken: 1 });
offerLetterSchema.index({ organizationId: 1, employeeId: 1 });

const OfferLetter = mongoose.model('OfferLetter', offerLetterSchema);

export default OfferLetter;
