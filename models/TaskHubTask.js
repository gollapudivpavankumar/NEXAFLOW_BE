import mongoose from 'mongoose';

/**
 * Jira Dashboard task.
 *
 * Distinct from the HRM-side `Task` model: multiple assignees, an explicit
 * review/approval step, tags, and an optional project. Actors are Users, so
 * org admins (who have no Employee record) can own and be assigned work.
 */
const taskHubTaskSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'approved'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dueDate: {
    type: Date,
    default: null
  },
  tags: [{ type: String }],
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskHubProject',
    default: null,
    index: true
  },
  parentProjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskHubProject',
    default: null,
    index: true
  }
}, {
  timestamps: true,
  collection: 'taskhub_tasks'
});

taskHubTaskSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
taskHubTaskSchema.index({ organizationId: 1, assignees: 1 });
taskHubTaskSchema.index({ organizationId: 1, projectId: 1, status: 1, createdAt: -1 });
taskHubTaskSchema.index({ organizationId: 1, parentProjectId: 1, status: 1 });

const TaskHubTask = mongoose.model('TaskHubTask', taskHubTaskSchema);

export default TaskHubTask;
