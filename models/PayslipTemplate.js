import mongoose from 'mongoose';

const payslipTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true
  },
  htmlContent: {
    type: String,
    required: [true, 'Template HTML content is required']
  },
  isGlobal: {
    type: Boolean,
    default: false  // true = super admin template for all orgs
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false,  // null for global templates, specific ID for org custom templates
    index: true
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
    default: false  // One template can be marked as default per org
  }
}, {
  timestamps: true
});

// Index for faster lookups
payslipTemplateSchema.index({ organizationId: 1, isActive: 1 });
payslipTemplateSchema.index({ isGlobal: 1, isActive: 1 });

const PayslipTemplate = mongoose.model('PayslipTemplate', payslipTemplateSchema);

export default PayslipTemplate;
