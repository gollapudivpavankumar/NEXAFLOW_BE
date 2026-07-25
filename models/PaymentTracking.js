import mongoose from 'mongoose';

const paymentTrackingSchema = new mongoose.Schema({
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
  grossPay: {
    type: Number,
    required: [true, 'Gross pay is required'],
    default: 0
  },
  vacationPayGross: {
    type: Number,
    default: 0
  },
  net: {
    type: Number,
    required: true,
    default: 0
  },
  tax: {
    type: Number,
    required: true,
    default: 0
  },
  federalTax: {
    type: Number,
    default: 0
  },
  provincialTax: {
    type: Number,
    default: 0
  },
  cpp: {
    type: Number,
    default: 0
  },
  ei: {
    type: Number,
    default: 0
  },
  remittance: {
    type: Number,
    required: true,
    default: 0
  },
  oldBalance: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    default: 0
  },
  received: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    default: 0
  },
  bankCash: {
    type: String,
    enum: ['bank', 'cash', 'added to next', ''],
    default: ''
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Calculate total and balance before saving
paymentTrackingSchema.pre('save', function(next) {
  // Validate payment arithmetic: gross - deductions should equal net (allow small rounding errors)
  if (this.isModified('grossPay') || this.isModified('federalTax') || this.isModified('provincialTax') ||
      this.isModified('cpp') || this.isModified('ei') || this.isModified('net')) {

    const totalDeductions = (this.federalTax || 0) + (this.provincialTax || 0) + (this.cpp || 0) + (this.ei || 0);
    const calculatedNet = (this.grossPay || 0) - totalDeductions;
    const difference = Math.abs(calculatedNet - (this.net || 0));

    // Allow up to 0.02 difference for rounding (2 cents)
    if (difference > 0.02) {
      console.warn(`Payment arithmetic warning: gross (${this.grossPay}) - deductions (${totalDeductions}) = ${calculatedNet}, but net is ${this.net}. Difference: ${difference.toFixed(2)}`);
      // Log warning but don't block save - some payments may have custom adjustments
    }
  }

  // Calculate total if not set manually
  if (this.isModified('net') || this.isModified('oldBalance')) {
    this.total = this.net + this.oldBalance;
  }

  // Calculate balance if not set manually
  if (this.isModified('total') || this.isModified('received')) {
    this.balance = this.total - this.received;
  }

  next();
});

// Index for faster queries
paymentTrackingSchema.index({ organizationId: 1, employeeId: 1, paymentDate: -1 });

const PaymentTracking = mongoose.model('PaymentTracking', paymentTrackingSchema);

export default PaymentTracking;
