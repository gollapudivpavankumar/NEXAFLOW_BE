import mongoose from 'mongoose';

const attendanceRegularizationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  requestType: {
    type: String,
    enum: ['Missing Punch', 'Wrong Punch', 'Half Day', 'Work From Home', 'On Duty'],
    required: true
  },
  expectedCheckIn: String,
  expectedCheckOut: String,
  actualCheckIn: String,
  actualCheckOut: String,
  reason: {
    type: String,
    required: true
  },
  attachments: [String],
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  reportingManagerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedDate: Date,
  reviewComments: String
}, {
  timestamps: true
});

attendanceRegularizationSchema.index({ organizationId: 1, status: 1 });
attendanceRegularizationSchema.index({ employeeId: 1 });
attendanceRegularizationSchema.index({ reportingManagerId: 1 });

const AttendanceRegularization = mongoose.model('AttendanceRegularization', attendanceRegularizationSchema);

export default AttendanceRegularization;
