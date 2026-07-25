/**
 * Calendar Reminder Service
 *
 * Uses node-cron to periodically check for upcoming calendar events
 * and automatically create reminder notifications for event creators
 * and accepted/pending participants.
 */

import cron from 'node-cron';
import CalendarEvent from '../models/CalendarEvent.js';
import Notification from '../models/Notification.js';

/**
 * Create a reminder notification for a specific user about an upcoming event.
 * Prevents duplicate notifications by checking if one was already created
 * within the last 60 seconds for the same event and user.
 *
 * @param {Object} event - The calendar event document
 * @param {import('mongoose').Types.ObjectId} userId - The user to notify
 * @param {import('mongoose').Types.ObjectId} organizationId - The organization ID
 * @returns {Promise<void>}
 */
async function createReminderNotification(event, userId, organizationId) {
  // Prevent duplicate notifications within a 60-second window
  const existing = await Notification.findOne({
    userId,
    relatedId: event._id,
    type: 'calendar',
    createdAt: { $gte: new Date(Date.now() - 60000) },
  });

  if (existing) {
    return;
  }

  await Notification.create({
    userId,
    organizationId,
    type: 'calendar',
    title: 'Upcoming Event',
    message: `"${event.title}" starts in 15 minutes`,
    link: '/calendar',
    relatedId: event._id,
  });
}

/**
 * Initialize the calendar reminder cron job.
 *
 * Runs every minute and looks for calendar events that start between
 * 15 and 16 minutes from now. For each matching event, creates reminder
 * notifications for the event creator and all accepted/pending participants.
 *
 * @returns {import('node-cron').ScheduledTask} The scheduled cron task
 */
export function initializeCalendarReminders() {
  const task = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const fifteenMinLater = new Date(now.getTime() + 15 * 60 * 1000);
      const sixteenMinLater = new Date(now.getTime() + 16 * 60 * 1000);

      const upcomingEvents = await CalendarEvent.find({
        startDate: {
          $gte: fifteenMinLater,
          $lt: sixteenMinLater,
        },
      });

      for (const event of upcomingEvents) {
        // Notify the event creator
        await createReminderNotification(
          event,
          event.createdBy,
          event.organizationId
        );

        // Notify each participant who has accepted or is still pending
        for (const participant of event.participants || []) {
          if (
            participant.status === 'accepted' ||
            participant.status === 'pending'
          ) {
            await createReminderNotification(
              event,
              participant.userId,
              event.organizationId
            );
          }
        }
      }
    } catch (error) {
      console.error('Calendar reminder error:', error.message);
    }
  });

  console.log('Calendar reminder service initialized');

  return task;
}
