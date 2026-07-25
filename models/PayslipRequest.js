import mongoose from 'mongoose';

const payslipRequestSchema = new mongoose.Schema({
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
  months: [{
    type: String,  // Format: "YYYY-MM" (e.g., "2025-01", "2025-02")
    required: true
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'generated', 'rejected'],
    default: 'pending',
    index: true
  },
  pdfUrl: {
    type: String,  // Path to generated PDF (if stored on server)
    required: false
  },
  requestedDate: {
    type: Date,
    default: Date.now
  },
  generatedDate: {
    type: Date,
    required: false
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
payslipRequestSchema.index({ organizationId: 1, status: 1 });
payslipRequestSchema.index({ employeeId: 1, status: 1 });

const PayslipRequest = mongoose.model('PayslipRequest', payslipRequestSchema);

export default PayslipRequest;
