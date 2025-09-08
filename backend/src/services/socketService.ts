import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

export const setupSocketIO = (io: SocketIOServer): void => {
  // Authentication middleware (optional when database is not available)
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        // Allow connection without authentication in development mode
        socket.userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        socket.user = { name: 'Guest User' };
        return next();
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        
        // Try to find user in database if available
        try {
          const user = await User.findById(decoded.userId).select('-password -refreshTokens');
          if (user) {
            socket.userId = user._id.toString();
            socket.user = user;
          } else {
            socket.userId = decoded.userId;
            socket.user = { name: 'Unknown User' };
          }
        } catch (dbError) {
          // Database not available, use token info
          socket.userId = decoded.userId;
          socket.user = { name: 'User' };
        }
        
        next();
      } catch (jwtError) {
        // Invalid token, allow as guest
        socket.userId = 'guest_' + Math.random().toString(36).substr(2, 9);
        socket.user = { name: 'Guest User' };
        next();
      }
    } catch (error) {
      // Allow connection as guest in case of any error
      socket.userId = 'guest_' + Math.random().toString(36).substr(2, 9);
      socket.user = { name: 'Guest User' };
      next();
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.userId} connected`);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Join user to general notifications room
    socket.join('notifications');

    // Handle task updates
    socket.on('task:update', (data) => {
      // Broadcast to all users in the same project or team
      socket.broadcast.emit('task:updated', data);
    });

    // Handle meeting updates
    socket.on('meeting:update', (data) => {
      // Broadcast to meeting attendees
      if (data.attendees) {
        data.attendees.forEach((attendee: any) => {
          socket.to(`user_${attendee.id}`).emit('meeting:updated', data);
        });
      }
    });

    // Handle real-time notifications
    socket.on('notification:send', (data) => {
      if (data.userId) {
        socket.to(`user_${data.userId}`).emit('notification:received', data);
      } else {
        socket.broadcast.emit('notification:received', data);
      }
    });

    // Handle typing indicators
    socket.on('typing:start', (data) => {
      socket.broadcast.emit('typing:started', {
        userId: socket.userId,
        ...data
      });
    });

    socket.on('typing:stop', (data) => {
      socket.broadcast.emit('typing:stopped', {
        userId: socket.userId,
        ...data
      });
    });

    // Handle meeting room events
    socket.on('meeting:join', (data) => {
      socket.join(`meeting_${data.meetingId}`);
      socket.to(`meeting_${data.meetingId}`).emit('meeting:user_joined', {
        userId: socket.userId,
        user: socket.user,
        ...data
      });
    });

    socket.on('meeting:leave', (data) => {
      socket.leave(`meeting_${data.meetingId}`);
      socket.to(`meeting_${data.meetingId}`).emit('meeting:user_left', {
        userId: socket.userId,
        ...data
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} disconnected`);
    });
  });
};

// Helper function to send notification to specific user
export const sendNotificationToUser = (io: SocketIOServer, userId: string, notification: any) => {
  io.to(`user_${userId}`).emit('notification:received', notification);
};

// Helper function to send notification to all users
export const sendNotificationToAll = (io: SocketIOServer, notification: any) => {
  io.to('notifications').emit('notification:received', notification);
};

// Helper function to send meeting reminder
export const sendMeetingReminder = (io: SocketIOServer, meeting: any) => {
  meeting.attendees.forEach((attendee: any) => {
    io.to(`user_${attendee.id}`).emit('meeting:reminder', {
      meeting,
      type: 'reminder',
      message: `Meeting "${meeting.title}" starts in 10 minutes`
    });
  });
};
