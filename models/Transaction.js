import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fieldChanged: {
    type: String,
    required: true
  },
  previousValue: {
    type: String
  },
  newValue: {
    type: String
  }
});

const transactionSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  expenseProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseProject',
    index: true
  },
  importBatchId: {
    type: String,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  subDescription: {
    type: String,
    trim: true,
    default: ''
  },
  transactionType: {
    type: String,
    enum: ['Debit', 'Credit'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balance: {
    type: Number,
    required: true
  },
  includeHST: {
    type: Boolean,
    default: false
  },
  includeGST: {
    type: Boolean,
    default: false
  },
  hstAmount: {
    type: Number,
    default: 0
  },
  gstAmount: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    default: 0
  },
  comments: {
    type: String,
    trim: true,
    default: ''
  },
  auditLogs: [auditLogSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Calculate HST, GST and Net amounts before saving
transactionSchema.pre('save', function(next) {
  // HST is 13%, GST is 5%
  // If amount includes tax, we calculate backwards: net = amount / (1 + rate)
  let taxRate = 0;
  if (this.includeHST) taxRate += 0.13;
  if (this.includeGST) taxRate += 0.05;

  if (taxRate > 0) {
    this.netAmount = this.amount / (1 + taxRate);
    const totalTaxAmount = this.amount - this.netAmount;

    // Distribute tax amounts proportionally
    if (this.includeHST && this.includeGST) {
      // Both enabled: split proportionally (13/18 for HST, 5/18 for GST)
      this.hstAmount = totalTaxAmount * (0.13 / taxRate);
      this.gstAmount = totalTaxAmount * (0.05 / taxRate);
    } else if (this.includeHST) {
      this.hstAmount = totalTaxAmount;
      this.gstAmount = 0;
    } else if (this.includeGST) {
      this.hstAmount = 0;
      this.gstAmount = totalTaxAmount;
    }
  } else {
    this.netAmount = this.amount;
    this.hstAmount = 0;
    this.gstAmount = 0;
  }
  next();
});

// Indexes for faster lookups
transactionSchema.index({ organizationId: 1, date: -1 });
transactionSchema.index({ organizationId: 1, transactionType: 1 });
transactionSchema.index({ organizationId: 1, expenseProjectId: 1 });
transactionSchema.index({ importBatchId: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
