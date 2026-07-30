import express from 'express';
import Notification from '../models/Notification.js';
import { protect, checkOrganizationAccess, employeeOrOrgAdmin } from '../middleware/auth.js';
import { toUserLite } from '../utils/userDirectory.js';

const router = express.Router();

/**
 * Notification inbox.
 *
 * Both products write into this one collection, tagged with `source`, so the
 * ERP bell and the Jira Dashboard bell read the same rows. Pass ?source=taskhub
 * to show only dashboard notifications.
 */

// @route   GET /api/notifications/:organizationId
// @desc    Recent notifications for the signed-in user plus an unread count
// @access  Employee, OrgAdmin
router.get('/:organizationId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { source, unread, limit = 50 } = req.query;
    const userId = req.user._id;

    const filter = { userId, organizationId };
    if (source === 'taskhub' || source === 'hrm') filter.source = source;
    if (unread === '1' || unread === 'true') filter.isRead = false;

    const unreadFilter = { userId, organizationId, isRead: false };
    if (filter.source) unreadFilter.source = filter.source;

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('actorId', '_id name email avatarColor role title')
        .sort({ createdAt: -1 })
        .limit(Math.min(parseInt(limit, 10) || 50, 200))
        .lean(),
      Notification.countDocuments(unreadFilter)
    ]);

    res.json({
      notifications: items.map((n) => ({
        _id: String(n._id),
        type: n.type,
        source: n.source,
        title: n.title,
        message: n.message,
        link: n.link || null,
        read: Boolean(n.isRead),
        actor: n.actorId ? toUserLite(n.actorId) : null,
        taskId: n.context?.taskId ? String(n.context.taskId) : null,
        projectId: n.context?.projectId ? String(n.context.projectId) : null,
        messageId: n.context?.messageId ? String(n.context.messageId) : null,
        createdAt: n.createdAt
      })),
      unread: unreadCount
    });
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/notifications/:organizationId/read
// @desc    Mark notifications read — all of them, or the given ids
// @access  Employee, OrgAdmin
router.post('/:organizationId/read', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { ids, source } = req.body || {};
    const userId = req.user._id;

    const filter = { userId, organizationId, isRead: false };
    if (Array.isArray(ids) && ids.length) filter._id = { $in: ids };
    if (source === 'taskhub' || source === 'hrm') filter.source = source;

    const result = await Notification.updateMany(filter, {
      $set: { isRead: true, readAt: new Date() }
    });

    res.json({ updated: result.modifiedCount });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
