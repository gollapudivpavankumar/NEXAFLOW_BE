import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  assetId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Laptop', 'Desktop', 'Monitor', 'Phone', 'Tablet', 'Keyboard', 'Mouse', 'Headset', 'Chair', 'Desk', 'Other']
  },
  manufacturer: String,
  model: String,
  serialNumber: String,
  purchaseDate: Date,
  purchasePrice: Number,
  warrantyExpiry: Date,
  condition: {
    type: String,
    enum: ['New', 'Good', 'Fair', 'Poor', 'Damaged'],
    default: 'New'
  },
  status: {
    type: String,
    enum: ['Available', 'Assigned', 'Under Repair', 'Retired', 'Lost'],
    default: 'Available'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  assignedDate: Date,
  assignmentHistory: [{
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    assignedDate: Date,
    returnedDate: Date,
    condition: String,
    notes: String
  }],
  specifications: String,
  qrCode: String,
  location: String,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
assetSchema.index({ organizationId: 1, status: 1 });
assetSchema.index({ organizationId: 1, assignedTo: 1 });
assetSchema.index({ organizationId: 1, assetId: 1 }, { unique: true });

const Asset = mongoose.model('Asset', assetSchema);

export default Asset;
