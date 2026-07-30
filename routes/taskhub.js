import express from 'express';
import mongoose from 'mongoose';
import TaskHubProject from '../models/TaskHubProject.js';
import TaskHubTask from '../models/TaskHubTask.js';
import {
  protect,
  checkOrganizationAccess,
  employeeOrOrgAdmin,
  requirePackage,
  requireModule
} from '../middleware/auth.js';
import { PACKAGES } from '../config/env.js';
import { toUserLite, listTaskHubMembers } from '../utils/userDirectory.js';
import { notifyTaskHub, notifyAdminsForReview } from '../services/taskHubNotify.js';
import { emitToOrg } from '../services/socketService.js';

const router = express.Router();

/**
 * Jira Dashboard API.
 *
 * Every route is scoped to an organization and passes four gates: a valid
 * token, membership of that organization, the org holding the `taskhub`
 * package, and the user having been granted the module. The Next.js dashboard
 * calls these through its own thin proxy routes and never touches MongoDB.
 */

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'approved'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/** Middleware chain applied to every dashboard route. */
const guard = [
  protect,
  checkOrganizationAccess,
  employeeOrOrgAdmin,
  requirePackage(PACKAGES.TASKHUB),
  requireModule(PACKAGES.TASKHUB)
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/** Dashboard admins are org admins and superadmins. */
function isHubAdmin(user) {
  return user.role === 'orgadmin' || user.role === 'superadmin';
}

/**
 * Every descendant project id beneath a parent, at any depth.
 *
 * Walks level by level rather than recursing per node, so a deep tree costs one
 * query per level instead of one per project. Guards against cycles, which a
 * bad import could otherwise turn into an infinite loop.
 *
 * @param {string} organizationId
 * @param {string} parentId
 * @returns {Promise<import('mongoose').Types.ObjectId[]>}
 */
async function getDescendantProjectIds(organizationId, parentId) {
  const collected = [];
  const seen = new Set([String(parentId)]);
  let frontier = [toObjectId(parentId)];

  while (frontier.length) {
    const children = await TaskHubProject.find({
      organizationId,
      parentProjectId: { $in: frontier }
    })
      .select('_id')
      .lean();

    const next = [];
    for (const child of children) {
      const key = String(child._id);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(child._id);
      next.push(child._id);
    }
    frontier = next;
  }

  return collected;
}

/**
 * Conditions restricting which projects a user may see.
 * Admins see everything in their org; everyone else sees open projects plus
 * any internal project they own or belong to.
 */
function projectVisibility(user) {
  if (isHubAdmin(user)) return null;
  return {
    $or: [
      { ownerId: user._id },
      { members: user._id },
      { isInternal: false }
    ]
  };
}

/** Can this user open this specific project? */
function canViewProject(user, project) {
  if (isHubAdmin(user)) return true;
  if (!project.isInternal) return true;

  const uid = String(user._id);
  const ownerId = project.ownerId?._id || project.ownerId;
  if (String(ownerId) === uid) return true;

  return (project.members || []).some((m) => String(m?._id || m) === uid);
}

/** Combine a base filter with optional extra conditions without clobbering `$or`. */
function andFilter(base, ...conditions) {
  const extras = conditions.filter(Boolean);
  if (!extras.length) return base;
  return { $and: [base, ...extras] };
}

/** Shape a populated project for the dashboard UI. */
function shapeProject(project) {
  if (!project) return null;
  return {
    ...project,
    _id: String(project._id),
    organizationId: String(project.organizationId),
    parentProjectId: project.parentProjectId
      ? (project.parentProjectId._id
        ? { ...project.parentProjectId, _id: String(project.parentProjectId._id) }
        : String(project.parentProjectId))
      : null,
    ownerId: project.ownerId?._id ? toUserLite(project.ownerId) : project.ownerId ? String(project.ownerId) : null,
    members: (project.members || []).map((m) => (m?._id ? toUserLite(m) : String(m)))
  };
}

/** Shape a populated task for the dashboard UI. */
function shapeTask(task) {
  if (!task) return null;
  const plain = typeof task.toObject === 'function' ? task.toObject() : task;
  return {
    ...plain,
    _id: String(plain._id),
    organizationId: String(plain.organizationId),
    assignees: (plain.assignees || []).map((a) => (a?._id ? toUserLite(a) : String(a))),
    createdBy: plain.createdBy?._id ? toUserLite(plain.createdBy) : plain.createdBy ? String(plain.createdBy) : null,
    approvedBy: plain.approvedBy?._id ? toUserLite(plain.approvedBy) : null,
    projectId: plain.projectId?._id
      ? { ...plain.projectId, _id: String(plain.projectId._id) }
      : plain.projectId
        ? String(plain.projectId)
        : null,
    parentProjectId: plain.parentProjectId ? String(plain.parentProjectId) : null
  };
}

const TASK_POPULATE = [
  { path: 'assignees', select: '_id name email avatarColor role title' },
  { path: 'createdBy', select: '_id name email avatarColor role title' },
  { path: 'approvedBy', select: '_id name email avatarColor role title' },
  { path: 'projectId', select: '_id name key color' }
];

const PROJECT_POPULATE = [
  { path: 'ownerId', select: '_id name email avatarColor role title' },
  { path: 'members', select: '_id name email avatarColor role title' }
];

/** Load a task the caller is allowed to see, or null. */
async function findTaskInOrg(organizationId, taskId) {
  if (!isValidId(taskId)) return null;
  return TaskHubTask.findOne({ _id: taskId, organizationId }).populate(TASK_POPULATE).lean();
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// @route   GET /api/taskhub/:organizationId/members
// @desc    Everyone in the org who can use the dashboard (assignee picker)
router.get('/:organizationId/members', guard, async (req, res) => {
  try {
    const members = await listTaskHubMembers(req.params.organizationId);
    res.json({ employees: members });
  } catch (error) {
    console.error('TaskHub list members error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

// @route   GET /api/taskhub/:organizationId/dashboard
// @desc    Counters plus recent and personal task lists for the landing page
router.get('/:organizationId/dashboard', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user._id;

    const [all, mine, pendingApproval, members, recent, myOpen] = await Promise.all([
      TaskHubTask.countDocuments({ organizationId }),
      TaskHubTask.countDocuments({ organizationId, assignees: userId, status: { $ne: 'approved' } }),
      TaskHubTask.countDocuments({ organizationId, status: 'review' }),
      listTaskHubMembers(organizationId),
      TaskHubTask.find({ organizationId })
        .populate(TASK_POPULATE)
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
      TaskHubTask.find({ organizationId, assignees: userId, status: { $ne: 'approved' } })
        .populate(TASK_POPULATE)
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(50)
        .lean()
    ]);

    res.json({
      stats: { all, mine, pendingApproval, employees: members.length },
      recent: recent.map(shapeTask),
      myOpen: myOpen.map(shapeTask)
    });
  } catch (error) {
    console.error('TaskHub dashboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

// @route   GET /api/taskhub/:organizationId/projects
// @desc    List projects with task counts and a completion percentage
router.get('/:organizationId/projects', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { parentProjectId, includeArchived, isRoot } = req.query;

    const base = { organizationId };
    if (includeArchived !== 'true') base.isArchived = false;

    if (isRoot === 'true') {
      base.parentProjectId = null;
    } else if (parentProjectId && isValidId(parentProjectId)) {
      base.parentProjectId = toObjectId(parentProjectId);
    }

    const filter = andFilter(base, projectVisibility(req.user));

    const projects = await TaskHubProject.find(filter)
      .populate(PROJECT_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    const projectIds = projects.map((p) => p._id);
    const counts = await TaskHubTask.aggregate([
      { $match: { organizationId: toObjectId(organizationId), projectId: { $in: projectIds } } },
      {
        $group: {
          _id: '$projectId',
          total: { $sum: 1 },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          review: { $sum: { $cond: [{ $eq: ['$status', 'review'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } }
        }
      }
    ]);

    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    const enriched = projects.map((p) => {
      const c = countMap.get(String(p._id)) || { total: 0, todo: 0, inProgress: 0, review: 0, approved: 0 };
      return {
        ...shapeProject(p),
        taskCounts: c,
        health: c.total > 0 ? Math.round(((c.approved + c.review) / c.total) * 100) : 0
      };
    });

    res.json({ projects: enriched });
  } catch (error) {
    console.error('TaskHub list projects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/taskhub/:organizationId/projects
// @desc    Create a project
router.post('/:organizationId/projects', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, key, description, parentProjectId, color, icon, isInternal } = req.body;

    const trimmedName = String(name || '').trim();
    const trimmedKey = String(key || '').trim().toUpperCase();

    if (!trimmedName) return res.status(400).json({ message: 'Name required' });
    if (!trimmedKey) return res.status(400).json({ message: 'Key required' });
    if (trimmedKey.length > 10) return res.status(400).json({ message: 'Key max 10 chars' });

    let parent = null;
    if (parentProjectId && isValidId(parentProjectId)) {
      parent = await TaskHubProject.findOne({ _id: parentProjectId, organizationId });
      if (!parent) return res.status(404).json({ message: 'Parent project not found' });
      if (!canViewProject(req.user, parent)) {
        return res.status(403).json({ message: 'No access to parent project' });
      }
    }

    const duplicate = await TaskHubProject.findOne({ organizationId, key: trimmedKey });
    if (duplicate) {
      return res.status(409).json({ message: `Project key "${trimmedKey}" is already used in this organization` });
    }

    const created = await TaskHubProject.create({
      organizationId,
      name: trimmedName,
      key: trimmedKey,
      description: String(description || '').trim(),
      parentProjectId: parent ? parent._id : null,
      ownerId: req.user._id,
      members: [],
      color: color || '#3b82f6',
      icon: icon || 'folder',
      isInternal: isInternal === true
    });

    const populated = await TaskHubProject.findById(created._id).populate(PROJECT_POPULATE).lean();
    emitToOrg(organizationId, 'taskhub:project_created', { projectId: String(created._id) });

    res.status(201).json({ project: shapeProject(populated) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'That project key is already used in this organization' });
    }
    console.error('TaskHub create project error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/taskhub/:organizationId/projects/:projectId
// @desc    Project detail with task stats and recent discussion
router.get('/:organizationId/projects/:projectId', guard, async (req, res) => {
  try {
    const { organizationId, projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ message: 'Invalid project ID' });

    const project = await TaskHubProject.findOne({ _id: projectId, organizationId })
      .populate(PROJECT_POPULATE)
      .populate({ path: 'parentProjectId', select: '_id name key' })
      .lean();

    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ message: 'Access denied' });

    const stats = await TaskHubTask.aggregate([
      { $match: { organizationId: toObjectId(organizationId), projectId: toObjectId(projectId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      project: shapeProject(project),
      stats: {
        tasks: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        totalTasks: stats.reduce((sum, s) => sum + s.count, 0)
      }
    });
  } catch (error) {
    console.error('TaskHub get project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/taskhub/:organizationId/projects/:projectId
// @desc    Update a project (owner or admin)
router.patch('/:organizationId/projects/:projectId', guard, async (req, res) => {
  try {
    const { organizationId, projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ message: 'Invalid project ID' });

    const project = await TaskHubProject.findOne({ _id: projectId, organizationId });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const isOwner = String(project.ownerId) === String(req.user._id);
    if (!isOwner && !isHubAdmin(req.user)) {
      return res.status(403).json({ message: 'Only owner or admin can update project' });
    }

    const body = req.body || {};
    const previousMembers = (project.members || []).map(String);

    if (body.name !== undefined) project.name = String(body.name).trim();
    if (body.description !== undefined) project.description = String(body.description).trim();
    if (body.color !== undefined) project.color = String(body.color);
    if (body.icon !== undefined) project.icon = String(body.icon);
    if (body.isArchived !== undefined) project.isArchived = Boolean(body.isArchived);
    if (body.isInternal !== undefined) project.isInternal = Boolean(body.isInternal);
    if (body.memberIds !== undefined) {
      project.members = Array.isArray(body.memberIds)
        ? body.memberIds.filter(isValidId).map(toObjectId)
        : [];
    }

    await project.save();

    const populated = await TaskHubProject.findById(project._id)
      .populate(PROJECT_POPULATE)
      .populate({ path: 'parentProjectId', select: '_id name key' })
      .lean();

    // Tell anyone newly added that they now have a project.
    if (body.memberIds !== undefined) {
      const added = (project.members || [])
        .map(String)
        .filter((m) => !previousMembers.includes(m));
      if (added.length) {
        await notifyTaskHub({
          users: added,
          organizationId,
          actor: req.user._id,
          type: 'project_invite',
          title: 'Added to a project',
          text: `You were added to ${project.name}`,
          projectId: String(project._id),
          link: `/projects/${project._id}`
        });
      }
    }

    emitToOrg(organizationId, 'taskhub:project_updated', { projectId: String(project._id) });
    res.json({ project: shapeProject(populated) });
  } catch (error) {
    console.error('TaskHub update project error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/taskhub/:organizationId/projects/:projectId
// @desc    Archive a project (soft delete; owner or admin)
router.delete('/:organizationId/projects/:projectId', guard, async (req, res) => {
  try {
    const { organizationId, projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ message: 'Invalid project ID' });

    const project = await TaskHubProject.findOne({ _id: projectId, organizationId });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const isOwner = String(project.ownerId) === String(req.user._id);
    if (!isOwner && !isHubAdmin(req.user)) {
      return res.status(403).json({ message: 'Only owner or admin can delete project' });
    }

    const children = await TaskHubProject.countDocuments({
      organizationId,
      parentProjectId: projectId,
      isArchived: false
    });
    if (children > 0) {
      return res.status(400).json({
        message: 'Cannot delete project with child projects. Move or delete children first.'
      });
    }

    project.isArchived = true;
    await project.save();

    emitToOrg(organizationId, 'taskhub:project_updated', { projectId: String(project._id) });
    res.json({ success: true, message: 'Project archived' });
  } catch (error) {
    console.error('TaskHub delete project error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/taskhub/:organizationId/projects/:projectId/kanban
// @desc    Tasks grouped into board columns
router.get('/:organizationId/projects/:projectId/kanban', guard, async (req, res) => {
  try {
    const { organizationId, projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ message: 'Invalid project ID' });

    const project = await TaskHubProject.findOne({ _id: projectId, organizationId }).lean();
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ message: 'Access denied' });

    const { scope, status, assignee, priority, dueDateFrom, dueDateTo } = req.query;

    let projectIds = [toObjectId(projectId)];
    if (scope === 'all') {
      projectIds = [toObjectId(projectId), ...(await getDescendantProjectIds(organizationId, projectId))];
    }

    const filter = { organizationId, projectId: { $in: projectIds } };
    if (status && TASK_STATUSES.includes(status)) filter.status = status;
    if (assignee && isValidId(assignee)) filter.assignees = toObjectId(assignee);
    if (priority && TASK_PRIORITIES.includes(priority)) filter.priority = priority;
    if (dueDateFrom || dueDateTo) {
      filter.dueDate = {};
      if (dueDateFrom) filter.dueDate.$gte = new Date(dueDateFrom);
      if (dueDateTo) filter.dueDate.$lte = new Date(dueDateTo);
    }

    const tasks = (await TaskHubTask.find(filter)
      .populate(TASK_POPULATE)
      .sort({ createdAt: -1 })
      .lean()).map(shapeTask);

    const columns = TASK_STATUSES.map((s) => ({
      status: s,
      title: s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' '),
      tasks: tasks.filter((t) => t.status === s)
    }));

    const projects = await TaskHubProject.find({ organizationId, _id: { $in: projectIds } })
      .select('_id name key color')
      .lean();

    res.json({
      columns,
      projects: projects.map((p) => ({ ...p, _id: String(p._id) })),
      totalTasks: tasks.length
    });
  } catch (error) {
    console.error('TaskHub kanban error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/taskhub/:organizationId/projects/:projectId/tasks
// @desc    Flat task list for one project (optionally including descendants)
router.get('/:organizationId/projects/:projectId/tasks', guard, async (req, res) => {
  try {
    const { organizationId, projectId } = req.params;
    if (!isValidId(projectId)) return res.status(400).json({ message: 'Invalid project ID' });

    const project = await TaskHubProject.findOne({ _id: projectId, organizationId }).lean();
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ message: 'Access denied' });

    const { scope, status, assignee, priority } = req.query;

    let projectIds = [toObjectId(projectId)];
    if (scope === 'all') {
      projectIds = [toObjectId(projectId), ...(await getDescendantProjectIds(organizationId, projectId))];
    }

    const filter = { organizationId, projectId: { $in: projectIds } };
    if (status && TASK_STATUSES.includes(status)) filter.status = status;
    if (assignee && isValidId(assignee)) filter.assignees = toObjectId(assignee);
    if (priority && TASK_PRIORITIES.includes(priority)) filter.priority = priority;

    const tasks = await TaskHubTask.find(filter)
      .populate(TASK_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ tasks: tasks.map(shapeTask) });
  } catch (error) {
    console.error('TaskHub project tasks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

// @route   GET /api/taskhub/:organizationId/tasks/export
// @desc    CSV of all tasks. Declared before /tasks/:taskId so "export" is not
//          swallowed as an id.
router.get('/:organizationId/tasks/export', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const tasks = await TaskHubTask.find({ organizationId })
      .populate(TASK_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    const escape = (value) => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['Title', 'Status', 'Priority', 'Project', 'Assignees', 'Tags', 'CreatedBy', 'DueDate', 'CompletedAt'];
    const rows = tasks.map((t) => {
      const shaped = shapeTask(t);
      return [
        shaped.title,
        shaped.status,
        shaped.priority,
        shaped.projectId?.name || '',
        (shaped.assignees || []).map((a) => a.name).join('; '),
        (shaped.tags || []).join('; '),
        shaped.createdBy?.name || '',
        shaped.dueDate ? new Date(shaped.dueDate).toISOString().slice(0, 10) : '',
        shaped.completedAt ? new Date(shaped.completedAt).toISOString().slice(0, 10) : ''
      ].map(escape).join(',');
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks-export.csv"');
    res.send([header.join(','), ...rows].join('\n'));
  } catch (error) {
    console.error('TaskHub export error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/taskhub/:organizationId/tasks/import
// @desc    Bulk-create tasks from parsed CSV rows
router.post('/:organizationId/tasks/import', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!rows.length) return res.status(400).json({ message: 'No rows to import' });

    const members = await listTaskHubMembers(organizationId);
    const byName = new Map(members.map((m) => [m.name.toLowerCase(), m._id]));
    const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m._id]));

    const projects = await TaskHubProject.find({ organizationId, isArchived: false })
      .select('_id name key')
      .lean();
    const projectByName = new Map(projects.map((p) => [String(p.name).toLowerCase(), p._id]));
    const projectByKey = new Map(projects.map((p) => [String(p.key).toLowerCase(), p._id]));

    const fallbackProject = await TaskHubProject.findOne({
      organizationId,
      isArchived: false,
      parentProjectId: null
    })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();

    const resolvePeople = (raw) =>
      String(raw || '')
        .split(/[;,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .map((token) => byEmail.get(token) || byName.get(token))
        .filter(Boolean);

    const docs = [];
    const skipped = [];

    for (const [index, row] of rows.entries()) {
      const title = String(row.Title || row.title || '').trim();
      if (!title) {
        skipped.push({ row: index + 1, reason: 'Missing title' });
        continue;
      }

      const rawStatus = String(row.Status || row.status || 'todo').trim().toLowerCase().replace(/[\s-]/g, '_');
      const rawPriority = String(row.Priority || row.priority || 'medium').trim().toLowerCase();
      const projectToken = String(row.Project || row.project || '').trim().toLowerCase();

      const dueDate = row.DueDate || row.dueDate;
      const parsedDue = dueDate ? new Date(dueDate) : null;

      docs.push({
        organizationId,
        title,
        description: String(row.Description || row.description || ''),
        status: TASK_STATUSES.includes(rawStatus) ? rawStatus : 'todo',
        priority: TASK_PRIORITIES.includes(rawPriority) ? rawPriority : 'medium',
        assignees: resolvePeople(row.Assignees || row.assignees),
        createdBy: req.user._id,
        dueDate: parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null,
        tags: String(row.Tags || row.tags || '')
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean),
        projectId:
          projectByKey.get(projectToken) ||
          projectByName.get(projectToken) ||
          fallbackProject?._id ||
          null
      });
    }

    if (!docs.length) {
      return res.status(400).json({ message: 'No valid rows to import', skipped });
    }

    const created = await TaskHubTask.insertMany(docs);
    emitToOrg(organizationId, 'taskhub:tasks_imported', { count: created.length });

    res.status(201).json({ imported: created.length, skipped });
  } catch (error) {
    console.error('TaskHub import error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/taskhub/:organizationId/tasks
// @desc    List tasks with filters
router.get('/:organizationId/tasks', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { scope, status, q, projectId, parentProjectId, includeChildren } = req.query;

    const base = { organizationId };
    if (scope === 'mine') base.assignees = req.user._id;
    if (status && TASK_STATUSES.includes(status)) base.status = status;
    if (q) base.title = { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    let scoping = null;
    if (projectId && isValidId(projectId)) {
      if (includeChildren === 'true') {
        const ids = [toObjectId(projectId), ...(await getDescendantProjectIds(organizationId, projectId))];
        scoping = { projectId: { $in: ids } };
      } else {
        scoping = { projectId: toObjectId(projectId) };
      }
    } else if (parentProjectId && isValidId(parentProjectId)) {
      const ids = [toObjectId(parentProjectId), ...(await getDescendantProjectIds(organizationId, parentProjectId))];
      scoping = { projectId: { $in: ids } };
    }

    const tasks = await TaskHubTask.find(andFilter(base, scoping))
      .populate(TASK_POPULATE)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ tasks: tasks.map(shapeTask) });
  } catch (error) {
    console.error('TaskHub list tasks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/taskhub/:organizationId/tasks
// @desc    Create a task
router.post('/:organizationId/tasks', guard, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const body = req.body || {};

    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title required' });

    // Fall back to the oldest root project so a quick-added task is never
    // orphaned outside every board.
    let projectId = body.projectId && isValidId(body.projectId) ? toObjectId(body.projectId) : null;
    if (projectId) {
      const exists = await TaskHubProject.findOne({ _id: projectId, organizationId }).select('_id').lean();
      if (!exists) return res.status(404).json({ message: 'Project not found' });
    } else {
      const fallback = await TaskHubProject.findOne({ organizationId, isArchived: false, parentProjectId: null })
        .sort({ createdAt: 1 })
        .select('_id')
        .lean();
      if (fallback) projectId = fallback._id;
    }

    const assignees = Array.isArray(body.assignees) ? body.assignees.filter(isValidId) : [];

    const created = await TaskHubTask.create({
      organizationId,
      title,
      description: String(body.description || ''),
      status: TASK_STATUSES.includes(body.status) ? body.status : 'todo',
      priority: TASK_PRIORITIES.includes(body.priority) ? body.priority : 'medium',
      assignees,
      createdBy: req.user._id,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      projectId,
      parentProjectId: body.parentProjectId && isValidId(body.parentProjectId) ? toObjectId(body.parentProjectId) : null
    });

    const populated = await TaskHubTask.findById(created._id).populate(TASK_POPULATE).lean();

    if (assignees.length) {
      await notifyTaskHub({
        users: assignees,
        organizationId,
        actor: req.user._id,
        type: 'task_assigned',
        title: 'New task assigned',
        text: `You were assigned: ${title}`,
        taskId: String(created._id),
        projectId: projectId ? String(projectId) : null,
        link: `/tasks/${created._id}`
      });
    }

    emitToOrg(organizationId, 'taskhub:task_created', { taskId: String(created._id) });
    res.status(201).json({ task: shapeTask(populated) });
  } catch (error) {
    console.error('TaskHub create task error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/taskhub/:organizationId/tasks/:taskId
// @desc    Task detail
router.get('/:organizationId/tasks/:taskId', guard, async (req, res) => {
  try {
    const task = await findTaskInOrg(req.params.organizationId, req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Not found' });
    res.json({ task: shapeTask(task) });
  } catch (error) {
    console.error('TaskHub get task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/taskhub/:organizationId/tasks/:taskId
// @desc    Update a task. Approving requires admin.
router.patch('/:organizationId/tasks/:taskId', guard, async (req, res) => {
  try {
    const { organizationId, taskId } = req.params;
    if (!isValidId(taskId)) return res.status(400).json({ message: 'Invalid task ID' });

    const before = await TaskHubTask.findOne({ _id: taskId, organizationId })
      .select('assignees title status')
      .lean();
    if (!before) return res.status(404).json({ message: 'Not found' });

    const body = req.body || {};
    const update = {};

    if (typeof body.title === 'string') update.title = body.title.trim();
    if (typeof body.description === 'string') update.description = body.description;

    if (TASK_STATUSES.includes(body.status)) {
      if (body.status === 'approved' && !isHubAdmin(req.user)) {
        return res.status(403).json({ message: 'Only admins can approve' });
      }
      update.status = body.status;
      if (body.status === 'review') update.completedAt = new Date();
      if (body.status === 'approved') {
        update.approvedBy = req.user._id;
        update.approvedAt = new Date();
      } else {
        update.approvedBy = null;
        update.approvedAt = null;
      }
    }

    if (TASK_PRIORITIES.includes(body.priority)) update.priority = body.priority;
    if (Array.isArray(body.assignees)) update.assignees = body.assignees.filter(isValidId);
    if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (Array.isArray(body.tags)) update.tags = body.tags;
    if (body.projectId !== undefined) {
      update.projectId = body.projectId && isValidId(body.projectId) ? toObjectId(body.projectId) : null;
      if (update.projectId) {
        const exists = await TaskHubProject.findOne({ _id: update.projectId, organizationId })
          .select('_id')
          .lean();
        if (!exists) return res.status(404).json({ message: 'Project not found' });
      }
    }

    const updated = await TaskHubTask.findOneAndUpdate(
      { _id: taskId, organizationId },
      update,
      { new: true }
    )
      .populate(TASK_POPULATE)
      .lean();

    if (!updated) return res.status(404).json({ message: 'Not found' });

    const shaped = shapeTask(updated);
    const assigneeIds = shaped.assignees.map((a) => a._id);

    if (Array.isArray(body.assignees)) {
      const previous = new Set((before.assignees || []).map(String));
      const added = body.assignees.map(String).filter((id) => !previous.has(id));
      if (added.length) {
        await notifyTaskHub({
          users: added,
          organizationId,
          actor: req.user._id,
          type: 'task_assigned',
          title: 'New task assigned',
          text: `You were assigned: ${shaped.title}`,
          taskId,
          link: `/tasks/${taskId}`
        });
      }
    }

    if (body.status === 'review' && before.status !== 'review') {
      await notifyAdminsForReview({
        organizationId,
        actor: req.user._id,
        taskId,
        taskTitle: shaped.title
      });
    }

    if (body.status === 'approved' && before.status !== 'approved') {
      await notifyTaskHub({
        users: assigneeIds,
        organizationId,
        actor: req.user._id,
        type: 'task_approved',
        title: 'Task approved',
        text: `Task approved: ${shaped.title}`,
        taskId,
        link: `/tasks/${taskId}`
      });
    }

    if (body.status && body.status !== 'approved' && before.status === 'approved') {
      await notifyTaskHub({
        users: assigneeIds,
        organizationId,
        actor: req.user._id,
        type: 'task_reopened',
        title: 'Task reopened',
        text: `Task reopened: ${shaped.title}`,
        taskId,
        link: `/tasks/${taskId}`
      });
    }

    emitToOrg(organizationId, 'taskhub:task_updated', { taskId, status: shaped.status });
    res.json({ task: shaped });
  } catch (error) {
    console.error('TaskHub update task error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/taskhub/:organizationId/tasks/:taskId/approve
// @desc    Approve a task (admin only)
router.post('/:organizationId/tasks/:taskId/approve', guard, async (req, res) => {
  try {
    const { organizationId, taskId } = req.params;
    if (!isHubAdmin(req.user)) return res.status(403).json({ message: 'Only admins can approve' });
    if (!isValidId(taskId)) return res.status(400).json({ message: 'Invalid task ID' });

    const updated = await TaskHubTask.findOneAndUpdate(
      { _id: taskId, organizationId },
      { status: 'approved', approvedBy: req.user._id, approvedAt: new Date() },
      { new: true }
    )
      .populate(TASK_POPULATE)
      .lean();

    if (!updated) return res.status(404).json({ message: 'Not found' });

    const shaped = shapeTask(updated);
    await notifyTaskHub({
      users: shaped.assignees.map((a) => a._id),
      organizationId,
      actor: req.user._id,
      type: 'task_approved',
      title: 'Task approved',
      text: `Task approved: ${shaped.title}`,
      taskId,
      link: `/tasks/${taskId}`
    });

    emitToOrg(organizationId, 'taskhub:task_updated', { taskId, status: 'approved' });
    res.json({ task: shaped });
  } catch (error) {
    console.error('TaskHub approve task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/taskhub/:organizationId/tasks/:taskId
// @desc    Delete a task and its discussion thread (admin only)
router.delete('/:organizationId/tasks/:taskId', guard, async (req, res) => {
  try {
    const { organizationId, taskId } = req.params;
    if (!isHubAdmin(req.user)) return res.status(403).json({ message: 'Only admins can delete tasks' });
    if (!isValidId(taskId)) return res.status(400).json({ message: 'Invalid task ID' });

    const deleted = await TaskHubTask.findOneAndDelete({ _id: taskId, organizationId });
    if (!deleted) return res.status(404).json({ message: 'Not found' });

    // Remove the bound discussion conversation and its messages. Imported
    // lazily so this module never hard-depends on the chat feature.
    const { default: Conversation } = await import('../models/Conversation.js');
    const { default: Message } = await import('../models/Message.js');
    const conversation = await Conversation.findOneAndDelete({
      organizationId,
      'context.kind': 'taskhub_task',
      'context.refId': taskId
    });
    if (conversation) {
      await Message.deleteMany({ conversationId: conversation._id });
    }

    emitToOrg(organizationId, 'taskhub:task_deleted', { taskId });
    res.json({ ok: true });
  } catch (error) {
    console.error('TaskHub delete task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
