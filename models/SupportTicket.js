import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  ticketId: {
    type: String,
    unique: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['HR', 'IT', 'Payroll', 'Leave', 'Asset', 'Other'],
    default: 'Other'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed', 'Reopened'],
    default: 'Open'
  },
  attachments: [String],
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    isInternal: {
      type: Boolean,
      default: false
    }
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedDate: Date,
  resolution: String
}, {
  timestamps: true
});

// Auto-generate ticket ID before validation so the unique constraint works
supportTicketSchema.pre('validate', async function(next) {
  if (!this.ticketId) {
    const count = await mongoose.model('SupportTicket').countDocuments({ organizationId: this.organizationId });
    this.ticketId = `TKT-${this.organizationId.toString().substring(0, 6).toUpperCase()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

supportTicketSchema.index({ organizationId: 1, status: 1 });
supportTicketSchema.index({ employeeId: 1 });
supportTicketSchema.index({ ticketId: 1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
