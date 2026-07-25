import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
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
  date: {
    type: Date,
    required: true,
    index: true
  },
  swipeInTime: {
    type: Date,
    required: true
  },
  swipeOutTime: {
    type: Date
  },
  breakStartTime: {
    type: Date
  },
  breakEndTime: {
    type: Date
  },
  totalHours: {
    type: Number,
    default: 0
  },
  breakHours: {
    type: Number,
    default: 0
  },
  workHours: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['clocked-in', 'on-break', 'clocked-out'],
    default: 'clocked-in'
  },
  notes: {
    type: String,
    trim: true
  },
  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster lookups
attendanceSchema.index({ employeeId: 1, date: 1 });
attendanceSchema.index({ organizationId: 1, date: 1 });

// Calculate hours before saving
attendanceSchema.pre('save', function(next) {
  if (this.swipeOutTime && this.swipeInTime) {
    const totalMs = this.swipeOutTime - this.swipeInTime;
    this.totalHours = parseFloat((totalMs / (1000 * 60 * 60)).toFixed(2));
  }

  if (this.breakEndTime && this.breakStartTime) {
    const breakMs = this.breakEndTime - this.breakStartTime;
    this.breakHours = parseFloat((breakMs / (1000 * 60 * 60)).toFixed(2));
  }

  this.workHours = parseFloat((this.totalHours - this.breakHours).toFixed(2));

  next();
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
