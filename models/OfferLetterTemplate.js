import mongoose from 'mongoose';

const offerLetterTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  isGlobal: {
    type: Boolean,
    default: false
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: function() {
      return !this.isGlobal;
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for faster lookups
offerLetterTemplateSchema.index({ organizationId: 1, isActive: 1 });
offerLetterTemplateSchema.index({ isGlobal: 1, isActive: 1 });

const OfferLetterTemplate = mongoose.model('OfferLetterTemplate', offerLetterTemplateSchema);

export default OfferLetterTemplate;
