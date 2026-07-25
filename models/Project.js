import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'on-hold', 'cancelled'],
    default: 'active'
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  assignedEmployees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }]
}, {
  timestamps: true
});

// Index for faster lookups
projectSchema.index({ organizationId: 1, status: 1 });
projectSchema.index({ organizationId: 1, name: 1 });

const Project = mongoose.model('Project', projectSchema);

export default Project;
