import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  loanType: {
    type: String,
    enum: ['salary_advance', 'personal_loan', 'emergency_loan', 'education_loan', 'other'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  interestRate: {
    type: Number,
    default: 0
  },
  totalRepayable: {
    type: Number,
    required: true
  },
  installments: {
    type: Number,
    required: true,
    min: 1
  },
  installmentAmount: {
    type: Number,
    required: true
  },
  remainingBalance: {
    type: Number,
    required: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  reason: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  approvalComments: {
    type: String
  },
  disbursementDate: {
    type: Date
  },
  completedDate: {
    type: Date
  },
  autoDeductFromPayroll: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

loanSchema.index({ organizationId: 1, employeeId: 1, status: 1 });

const Loan = mongoose.model('Loan', loanSchema);
export default Loan;
