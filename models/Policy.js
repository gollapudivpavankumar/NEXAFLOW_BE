import mongoose from 'mongoose';

const policySchema = new mongoose.Schema({
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
  content: String, // For text policies
  fileUrl: String, // For PDF/document policies
  fileType: {
    type: String,
    enum: ['text', 'pdf', 'doc', 'docx']
  },
  category: {
    type: String,
    enum: ['HR', 'IT', 'Security', 'Compliance', 'General', 'Other'],
    default: 'General'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  requiresAgreement: {
    type: Boolean,
    default: true
  },
  effectiveDate: Date,
  expiryDate: Date,
  version: {
    type: String,
    default: '1.0'
  },
  acknowledgments: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    acknowledgedDate: Date,
    ipAddress: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

policySchema.index({ organizationId: 1, isActive: 1 });

const Policy = mongoose.model('Policy', policySchema);

export default Policy;
