import mongoose from 'mongoose';

const loanRepaymentSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentDate: {
    type: Date,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['payroll_deduction', 'manual', 'bank_transfer'],
    default: 'payroll_deduction'
  },
  paymentTrackingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentTracking'
  },
  installmentNumber: {
    type: Number,
    required: true
  },
  balanceAfterPayment: {
    type: Number,
    required: true
  },
  notes: {
    type: String
  }
}, { timestamps: true });

loanRepaymentSchema.index({ loanId: 1, paymentDate: -1 });

const LoanRepayment = mongoose.model('LoanRepayment', loanRepaymentSchema);
export default LoanRepayment;
