const webpush = require('web-push') as any;
import { Notification } from '../models/Notification';
import { User } from '../models/User';

// Configure web push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@taskmanager.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export class NotificationService {
  static async sendToUser(userId: string, payload: NotificationPayload) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Create notification record
      const notification = new Notification({
        userId,
        type: 'task_reminder',
        title: payload.title,
        message: payload.body,
        data: payload.data,
        isRead: false
      });
      await notification.save();

      // Send push notification if user has subscription
      if ((user as any).pushSubscription) {
        await webpush.sendNotification(
          (user as any).pushSubscription,
          JSON.stringify(payload)
        );
      }

      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  static async sendToAll(payload: NotificationPayload) {
    try {
      const users = await User.find({ pushSubscription: { $exists: true } });
      
      const notifications = await Promise.all(
        users.map(async (user) => {
          const notification = new Notification({
            userId: user._id,
            type: 'task_reminder',
            title: payload.title,
            message: payload.body,
            data: payload.data,
            isRead: false
          });
          await notification.save();

          if ((user as any).pushSubscription) {
            await webpush.sendNotification(
              (user as any).pushSubscription,
              JSON.stringify(payload)
            );
          }

          return notification;
        })
      );

      return notifications;
    } catch (error) {
      console.error('Error sending notifications to all users:', error);
      throw error;
    }
  }

  static async sendTaskReminder(taskId: string, userId: string) {
    const payload: NotificationPayload = {
      title: 'Task Reminder',
      body: 'You have a task due soon!',
      icon: '/icons/task-icon.png',
      data: { taskId, type: 'task_reminder' },
      actions: [
        { action: 'view', title: 'View Task' },
        { action: 'complete', title: 'Mark Complete' }
      ]
    };

    return this.sendToUser(userId, payload);
  }

  static async sendMeetingReminder(meetingId: string, userId: string) {
    const payload: NotificationPayload = {
      title: 'Meeting Starting Soon',
      body: 'Your meeting will begin in 10 minutes',
      icon: '/icons/meeting-icon.png',
      data: { meetingId, type: 'meeting_reminder' },
      actions: [
        { action: 'join', title: 'Join Meeting' },
        { action: 'view', title: 'View Details' }
      ]
    };

    return this.sendToUser(userId, payload);
  }

  static async sendOverdueTaskAlert(taskId: string, userId: string) {
    const payload: NotificationPayload = {
      title: 'Overdue Task Alert',
      body: 'You have an overdue task that needs attention',
      icon: '/icons/alert-icon.png',
      data: { taskId, type: 'overdue_task' },
      actions: [
        { action: 'view', title: 'View Task' },
        { action: 'update', title: 'Update Deadline' }
      ]
    };

    return this.sendToUser(userId, payload);
  }

  static async getUserNotifications(userId: string, limit = 20) {
    return Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  static async markAsRead(notificationId: string, userId: string) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true }
    );
  }

  static async markAllAsRead(userId: string) {
    return Notification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );
  }
}
