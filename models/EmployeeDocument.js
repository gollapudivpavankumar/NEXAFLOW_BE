import mongoose from 'mongoose';

const employeeDocumentSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  documentName: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true
  },
  documentType: {
    type: String,
    enum: [
      'ID Proof',
      'Address Proof',
      'Resume',
      'Contract',
      'Tax Forms',
      'Bank Details',
      'Certificates',
      'Performance Review',
      'Other'
    ],
    default: 'Other'
  },
  fileData: {
    type: String, // Base64 encoded file data
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String, // MIME type (e.g., 'application/pdf', 'image/png')
    required: true
  },
  fileSize: {
    type: Number, // Size in bytes
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String,
    trim: true
  },
  expiryDate: {
    type: Date // For documents that expire (like ID, certifications)
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
employeeDocumentSchema.index({ employeeId: 1, documentType: 1 });
employeeDocumentSchema.index({ organizationId: 1, employeeId: 1 });

const EmployeeDocument = mongoose.model('EmployeeDocument', employeeDocumentSchema);

export default EmployeeDocument;
