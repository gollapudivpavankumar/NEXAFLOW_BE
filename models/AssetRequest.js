import mongoose from 'mongoose';

const assetRequestSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  assetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset',
    required: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  requestType: {
    type: String,
    enum: ['Repair', 'Handover', 'Replacement'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Rejected'],
    default: 'Pending'
  },
  attachments: [String],
  adminNotes: String,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedDate: Date
}, {
  timestamps: true
});

assetRequestSchema.index({ organizationId: 1, status: 1 });
assetRequestSchema.index({ employeeId: 1 });

const AssetRequest = mongoose.model('AssetRequest', assetRequestSchema);

export default AssetRequest;
