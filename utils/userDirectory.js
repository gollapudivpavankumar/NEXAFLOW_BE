import User from '../models/User.js';
import { colorFromString } from './avatarColor.js';

/**
 * User presentation helpers shared by the Jira Dashboard routes.
 *
 * Deliberately reads only the User collection. The Jira Dashboard is sold as a
 * standalone package, so an organization using it may hold no Employee records
 * at all — display names live on User and are kept in sync when an employee is
 * created or renamed (see routes/employeeWithLogin.js and routes/employees.js).
 */

/** Fields to select when a User is only needed for display. */
export const USER_LITE_FIELDS = '_id name email avatarColor role title isActive';

/**
 * Shape a User document the way the dashboard's UI expects.
 *
 * Falls back to the email's local part when no name has been set, so a user
 * created before the `name` field existed still renders sensibly instead of
 * showing a blank avatar.
 *
 * @param {object|null} user - A User document or lean object.
 * @returns {object|null}
 */
export function toUserLite(user) {
  if (!user) return null;

  const email = user.email || '';
  const name = user.name?.trim() || email.split('@')[0] || 'Unknown';
  const role = user.role === 'superadmin' || user.role === 'orgadmin' ? 'admin' : 'employee';

  return {
    _id: String(user._id),
    name,
    email,
    avatarColor: user.avatarColor || colorFromString(email),
    role,
    title: user.title || ''
  };
}

/** Map an array of User documents through {@link toUserLite}. */
export function toUserLiteList(users) {
  return (users || []).map(toUserLite).filter(Boolean);
}

/**
 * Everyone in an organization who can open the Jira Dashboard.
 *
 * Org admins and superadmins are always included — they administer the board
 * and must be assignable even though no one explicitly granted them the module.
 *
 * @param {string} organizationId
 * @returns {Promise<object[]>} Users in dashboard-lite shape, sorted by name.
 */
export async function listTaskHubMembers(organizationId) {
  const users = await User.find({
    organizationId,
    isActive: { $ne: false },
    $or: [
      { 'moduleAccess.taskhub': true },
      { role: 'orgadmin' },
      { role: 'superadmin' }
    ]
  })
    .select(USER_LITE_FIELDS)
    .lean();

  return toUserLiteList(users).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a set of user ids to display shapes, keyed by id.
 *
 * @param {Array<string|import('mongoose').Types.ObjectId>} userIds
 * @returns {Promise<Map<string, object>>}
 */
export async function resolveUsers(userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean).map((id) => String(id)))];
  if (!unique.length) return new Map();

  const users = await User.find({ _id: { $in: unique } })
    .select(USER_LITE_FIELDS)
    .lean();

  return new Map(users.map((u) => [String(u._id), toUserLite(u)]));
}

/**
 * The ids of every org admin in an organization.
 * Used to notify approvers when a task is submitted for review.
 *
 * @param {string} organizationId
 * @returns {Promise<string[]>}
 */
export async function listOrgAdminIds(organizationId) {
  const admins = await User.find({
    organizationId,
    role: 'orgadmin',
    isActive: { $ne: false }
  })
    .select('_id')
    .lean();

  return admins.map((a) => String(a._id));
}
