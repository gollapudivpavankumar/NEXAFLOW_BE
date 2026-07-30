import mongoose from 'mongoose';

/**
 * Jira Dashboard project.
 *
 * Lives in its own `taskhub_projects` collection so the Jira Dashboard can be
 * sold as a standalone package. It references Organization and User only —
 * never Employee, which belongs to the HRM package. See
 * scripts/checkPackageBoundary.js, which fails the build if that rule breaks.
 */
const taskHubProjectSchema = new mongoose.Schema({
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
  key: {
    type: String,
    required: [true, 'Project key is required'],
    uppercase: true,
    trim: true,
    maxlength: [10, 'Project key must be 10 characters or fewer']
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  parentProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskHubProject',
    default: null,
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  color: {
    type: String,
    default: '#3b82f6'
  },
  icon: {
    type: String,
    default: 'folder'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  // Internal projects are visible only to the owner, members and org admins.
  isInternal: {
    type: Boolean,
    default: false
  },
  settings: {
    defaultTaskStatus: { type: String, default: 'todo' },
    defaultTaskPriority: { type: String, default: 'medium' },
    allowCrossProjectTasks: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  collection: 'taskhub_projects'
});

taskHubProjectSchema.index({ organizationId: 1, isArchived: 1 });
taskHubProjectSchema.index({ organizationId: 1, parentProjectId: 1, isArchived: 1 });
taskHubProjectSchema.index({ organizationId: 1, members: 1 });
taskHubProjectSchema.index({ organizationId: 1, ownerId: 1 });
// Project keys are unique per organization, not globally — two tenants may both
// use "WEB" without colliding.
taskHubProjectSchema.index({ organizationId: 1, key: 1 }, { unique: true });

const TaskHubProject = mongoose.model('TaskHubProject', taskHubProjectSchema);

export default TaskHubProject;
