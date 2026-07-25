import mongoose from 'mongoose';

const bankFileSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  fileType: {
    type: String,
    enum: ['CPA005', 'CSV', 'custom'],
    default: 'CPA005'
  },
  fileName: {
    type: String,
    required: true
  },
  fileContent: {
    type: String
  },
  paymentDate: {
    type: Date,
    required: true
  },
  totalRecords: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  companyProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile'
  },
  status: {
    type: String,
    enum: ['generated', 'downloaded', 'submitted_to_bank', 'processed', 'error'],
    default: 'generated'
  },
  employees: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    name: { type: String },
    bankTransit: { type: String },
    bankAccountNumber: { type: String },
    financialInstitution: { type: String },
    amount: { type: Number },
    paymentTrackingId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracking' }
  }],
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String
  }
}, { timestamps: true });

bankFileSchema.index({ organizationId: 1, createdAt: -1 });

const BankFile = mongoose.model('BankFile', bankFileSchema);
export default BankFile;
