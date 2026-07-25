import mongoose from 'mongoose';

const leaveBalanceSchema = new mongoose.Schema({
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
  leaveTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveType',
    required: true
  },
  year: {
    type: Number,
    required: true,
    default: () => new Date().getFullYear()
  },
  totalDays: {
    type: Number,
    required: true,
    min: 0
  },
  usedDays: {
    type: Number,
    default: 0,
    min: 0
  },
  availableDays: {
    type: Number,
    default: function() {
      return (this.totalDays || 0) - (this.usedDays || 0);
    }
  }
}, {
  timestamps: true
});

// Index for faster lookups
leaveBalanceSchema.index({ employeeId: 1, year: 1 });
leaveBalanceSchema.index({ organizationId: 1, year: 1 });
leaveBalanceSchema.index({ employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

// Calculate available days before saving
leaveBalanceSchema.pre('save', function(next) {
  this.availableDays = this.totalDays - this.usedDays;
  next();
});

const LeaveBalance = mongoose.model('LeaveBalance', leaveBalanceSchema);

export default LeaveBalance;
