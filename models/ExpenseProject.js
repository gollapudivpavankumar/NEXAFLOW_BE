import mongoose from 'mongoose';

const expenseProjectSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  budget: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'On Hold', 'Cancelled'],
    default: 'Active'
  },
  // Default tax settings for transactions in this project
  taxSettings: {
    debit: {
      hstEnabled: { type: Boolean, default: false },
      gstEnabled: { type: Boolean, default: false }
    },
    credit: {
      hstEnabled: { type: Boolean, default: false },
      gstEnabled: { type: Boolean, default: false }
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for faster lookups
expenseProjectSchema.index({ organizationId: 1, status: 1 });

const ExpenseProject = mongoose.model('ExpenseProject', expenseProjectSchema);

export default ExpenseProject;
