import mongoose from 'mongoose';

const companyProfileSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  profileName: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    required: true
  },
  companyEmail: {
    type: String,
    required: true
  },
  companyAddress: {
    type: String,
    required: true
  },
  companyPhone: {
    type: String,
    required: true
  },
  companyLogo: {
    type: String // URL to uploaded logo
  },
  // Bank details for payslips
  bankAccountName: {
    type: String // Name on bank account (may differ from company name)
  },
  bankAccountNumber: {
    type: String
  },
  bankTransitNumber: {
    type: String
  },
  bankInstitutionNumber: {
    type: String
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
companyProfileSchema.index({ organizationId: 1, profileName: 1 });
companyProfileSchema.index({ organizationId: 1, isDefault: -1 });

const CompanyProfile = mongoose.model('CompanyProfile', companyProfileSchema);

export default CompanyProfile;
