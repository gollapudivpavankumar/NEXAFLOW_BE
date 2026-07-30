import Notification from '../models/Notification.js';
import { emitToUsers } from './socketService.js';
import { listOrgAdminIds } from '../utils/userDirectory.js';

/**
 * Notification helpers for the Jira Dashboard.
 *
 * Writes into the shared Notification collection tagged `source: 'taskhub'`,
 * then pushes the same payload down the existing Socket.IO connection so the
 * bell updates without polling. Persisting and emitting together is what keeps
 * the two products' inboxes consistent — there is one row, seen by both.
 */

/** Mentions are written as `@[Display Name](userId)` by the dashboard's MentionInput. */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Pull user ids out of a message body's mention markup.
 *
 * @param {string} text
 * @returns {string[]} Unique user ids, in first-seen order.
 */
export function extractMentionIds(text) {
  const ids = [];
  for (const match of String(text || '').matchAll(MENTION_RE)) {
    ids.push(match[2]);
  }
  return [...new Set(ids)];
}

/**
 * Create notifications for a set of users and push them over Socket.IO.
 *
 * The actor is always removed from the recipient list — you never get told
 * about your own action. No-ops when that leaves nobody.
 *
 * @param {object} opts
 * @param {string[]|string} opts.users - Recipient user ids.
 * @param {string} opts.organizationId
 * @param {string|null} [opts.actor] - User id who triggered this.
 * @param {string} opts.type - A Notification type enum value.
 * @param {string} opts.title
 * @param {string} opts.text - Body copy.
 * @param {string|null} [opts.taskId]
 * @param {string|null} [opts.projectId]
 * @param {string|null} [opts.messageId]
 * @param {string|null} [opts.link] - Path within the dashboard to open.
 * @returns {Promise<object[]>} The created notification documents.
 */
export async function notifyTaskHub(opts) {
  const {
    users,
    organizationId,
    actor = null,
    type,
    title,
    text,
    taskId = null,
    projectId = null,
    messageId = null,
    link = null
  } = opts;

  const list = Array.isArray(users) ? users : [users];
  const recipients = [...new Set(list.filter(Boolean).map(String))]
    .filter((u) => !actor || u !== String(actor));

  if (!recipients.length) return [];

  const docs = recipients.map((userId) => ({
    userId,
    organizationId,
    actorId: actor || null,
    type,
    source: 'taskhub',
    title,
    message: text,
    link,
    relatedId: taskId || projectId || null,
    context: { taskId, projectId, messageId },
    isRead: false
  }));

  const created = await Notification.insertMany(docs);

  emitToUsers(recipients, 'notification', {
    source: 'taskhub',
    type,
    title,
    message: text,
    link,
    context: { taskId, projectId, messageId },
    createdAt: new Date().toISOString()
  });

  return created;
}

/**
 * Tell every org admin that a task is waiting on their approval.
 *
 * @param {object} opts
 * @param {string} opts.organizationId
 * @param {string} opts.actor
 * @param {string} opts.taskId
 * @param {string} opts.taskTitle
 */
export async function notifyAdminsForReview({ organizationId, actor, taskId, taskTitle }) {
  const adminIds = await listOrgAdminIds(organizationId);
  if (!adminIds.length) return [];

  return notifyTaskHub({
    users: adminIds,
    organizationId,
    actor,
    type: 'task_ready',
    title: 'Task ready for approval',
    text: `Task ready for approval: ${taskTitle}`,
    taskId,
    link: `/tasks/${taskId}`
  });
}

export default notifyTaskHub;
