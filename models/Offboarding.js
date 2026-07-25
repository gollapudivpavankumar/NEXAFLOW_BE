import mongoose from 'mongoose';

const offboardingSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  separationType: {
    type: String,
    enum: ['resignation', 'termination', 'retirement', 'layoff', 'contract_end', 'other'],
    required: true
  },
  lastWorkingDate: {
    type: Date,
    required: true
  },
  resignationDate: {
    type: Date
  },
  noticePeriodDays: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['initiated', 'in_progress', 'pending_settlement', 'completed', 'cancelled'],
    default: 'initiated',
    index: true
  },
  clearances: [{
    department: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'cleared', 'issues_found'], default: 'pending' },
    clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    clearedDate: { type: Date },
    remarks: { type: String }
  }],
  assetReturns: [{
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    assetName: { type: String },
    status: { type: String, enum: ['pending', 'returned', 'damaged', 'not_returned'], default: 'pending' },
    returnedDate: { type: Date },
    condition: { type: String },
    remarks: { type: String }
  }],
  documentHandover: [{
    documentName: { type: String, required: true },
    handedOverTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    completedDate: { type: Date }
  }],
  knowledgeTransfer: [{
    topic: { type: String, required: true },
    transferTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
    notes: { type: String },
    completedDate: { type: Date }
  }],
  exitInterview: {
    scheduled: { type: Boolean, default: false },
    scheduledDate: { type: Date },
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completed: { type: Boolean, default: false },
    reasonForLeaving: { type: String },
    feedback: { type: String },
    wouldRecommend: { type: Boolean },
    rating: { type: Number, min: 1, max: 5 }
  },
  finalSettlement: {
    remainingSalary: { type: Number, default: 0 },
    leaveEncashment: { type: Number, default: 0 },
    leaveDaysEncashed: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    loanRecovery: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    totalSettlement: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'calculated', 'approved', 'paid'], default: 'pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidDate: { type: Date },
    notes: { type: String }
  },
  completedDate: {
    type: Date
  },
  remarks: {
    type: String
  }
}, { timestamps: true });

offboardingSchema.index({ organizationId: 1, status: 1 });

const Offboarding = mongoose.model('Offboarding', offboardingSchema);
export default Offboarding;
