/**
 * Socket.IO Real-time Communication Service
 *
 * Initializes a Socket.IO server with JWT-based authentication,
 * user presence tracking, conversation rooms, messaging, typing
 * indicators, call signals, and read receipts.
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserPresence from '../models/UserPresence.js';
import Conversation from '../models/Conversation.js';

let io;

/**
 * Initialize the Socket.IO server on the given HTTP server instance.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server to attach to
 * @returns {Server} The Socket.IO server instance
 */
export function initializeSocketService(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // --- Authentication Middleware ---
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(
        token,
        'your-super-secret-jwt-key-change-this-in-production'
      );

      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  // --- Connection Handler ---
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.email}`);

    // Join rooms SYNCHRONOUSLY on connect — before any awaited DB work — so a
    // call/message fired immediately after connect is never missed due to a
    // race with the presence write below.
    socket.join(`org:${socket.user.organizationId}`);
    socket.join(`user:${socket.user._id}`);

    // Set user online
    await UserPresence.findOneAndUpdate(
      { userId: socket.user._id },
      {
        userId: socket.user._id,
        organizationId: socket.user.organizationId,
        status: 'online',
        lastSeen: new Date(),
      },
      { upsert: true, new: true }
    );

    // Broadcast online presence to organization
    io.to(`org:${socket.user.organizationId}`).emit('presence_update', {
      userId: socket.user._id,
      status: 'online',
    });

    // --- Conversation Room Management ---

    socket.on('join_room', async (conversationId) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.some(p => p.toString() === socket.user._id.toString())) {
          socket.emit('error', { message: 'Not authorized to join this conversation' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave_room', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // --- Messaging ---

    socket.on('new_message', (data) => {
      if (!data || !data.conversationId) {
        socket.emit('error', { message: 'conversationId is required' });
        return;
      }
      io.to(`conversation:${data.conversationId}`).emit('new_message', {
        ...data,
        senderId: socket.user._id,
      });
    });

    // --- Typing Indicators ---

    socket.on('typing', (data) => {
      if (!data || !data.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('typing', {
        userId: socket.user._id,
        userName: socket.user.email,
      });
    });

    socket.on('stop_typing', (data) => {
      if (!data || !data.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('stop_typing', {
        userId: socket.user._id,
      });
    });

    // --- Legacy call signals (kept for backward compatibility) ---

    socket.on('call_started', (data) => {
      if (!data || !data.conversationId) return;
      io.to(`conversation:${data.conversationId}`).emit('call_started', {
        ...data,
        initiatedBy: socket.user._id,
      });
    });

    socket.on('call_ended', (data) => {
      if (!data || !data.conversationId) return;
      io.to(`conversation:${data.conversationId}`).emit('call_ended', data);
    });

    // ========================================================================
    // WebRTC signaling (raw peer-to-peer, mesh topology for group calls)
    // ------------------------------------------------------------------------
    // Ringing/lifecycle events target a callee's personal room `user:<id>`.
    // In-call media negotiation is relayed directly between socket ids so a
    // user can be present on multiple tabs/devices without cross-talk.
    // ========================================================================

    const caller = () => ({
      id: socket.user._id,
      name: socket.user.name || socket.user.email,
      email: socket.user.email,
    });

    // Ring one or more callees. `calleeIds` are user ids.
    socket.on('call:invite', (data) => {
      if (!data || !data.callId || !Array.isArray(data.calleeIds)) return;
      const payload = {
        callId: data.callId,
        conversationId: data.conversationId || null,
        callType: data.callType === 'audio' ? 'audio' : 'video',
        callName: data.callName || null,
        from: caller(),
      };
      data.calleeIds
        .filter((id) => id && id.toString() !== socket.user._id.toString())
        .forEach((id) => {
          io.to(`user:${id}`).emit('call:incoming', payload);
        });
    });

    // Callee accepted — tell the caller so they stop ringing and wait for join.
    socket.on('call:accept', (data) => {
      if (!data || !data.callId || !data.toUserId) return;
      io.to(`user:${data.toUserId}`).emit('call:accepted', {
        callId: data.callId,
        by: caller(),
      });
    });

    // Callee rejected.
    socket.on('call:reject', (data) => {
      if (!data || !data.callId || !data.toUserId) return;
      io.to(`user:${data.toUserId}`).emit('call:rejected', {
        callId: data.callId,
        by: { id: socket.user._id },
      });
    });

    // Caller cancelled before anyone answered (or hung up ringing).
    socket.on('call:cancel', (data) => {
      if (!data || !data.callId || !Array.isArray(data.calleeIds)) return;
      data.calleeIds.forEach((id) => {
        io.to(`user:${id}`).emit('call:cancelled', { callId: data.callId });
      });
    });

    // Join the call's mesh room. The joiner is told about existing peers and is
    // responsible for initiating offers to them (newcomer-initiates avoids glare).
    socket.on('call:join', (data) => {
      if (!data || !data.callId) return;
      const room = `call:${data.callId}`;

      // Collect peers already in the room BEFORE we join.
      const existing = [];
      const roomSet = io.sockets.adapter.rooms.get(room);
      if (roomSet) {
        for (const sid of roomSet) {
          const s = io.sockets.sockets.get(sid);
          if (s && s.user) {
            existing.push({
              socketId: sid,
              userId: s.user._id,
              name: s.user.name || s.user.email,
            });
          }
        }
      }

      socket.join(room);

      // Tell the joiner who to connect to.
      socket.emit('call:peers', { callId: data.callId, peers: existing });

      // Tell existing peers a newcomer arrived (they wait for the offer).
      socket.to(room).emit('call:peer-joined', {
        callId: data.callId,
        socketId: socket.id,
        userId: socket.user._id,
        name: socket.user.name || socket.user.email,
      });
    });

    // Relay SDP/ICE directly to a specific peer socket.
    socket.on('webrtc:offer', (data) => {
      if (!data || !data.targetSocketId || !data.sdp) return;
      io.to(data.targetSocketId).emit('webrtc:offer', {
        callId: data.callId,
        fromSocketId: socket.id,
        fromUserId: socket.user._id,
        name: socket.user.name || socket.user.email,
        sdp: data.sdp,
      });
    });

    socket.on('webrtc:answer', (data) => {
      if (!data || !data.targetSocketId || !data.sdp) return;
      io.to(data.targetSocketId).emit('webrtc:answer', {
        callId: data.callId,
        fromSocketId: socket.id,
        fromUserId: socket.user._id,
        sdp: data.sdp,
      });
    });

    socket.on('webrtc:ice-candidate', (data) => {
      if (!data || !data.targetSocketId || !data.candidate) return;
      io.to(data.targetSocketId).emit('webrtc:ice-candidate', {
        fromSocketId: socket.id,
        candidate: data.candidate,
      });
    });

    // Broadcast mic/cam/screen state changes to the room for UI badges.
    socket.on('call:media-state', (data) => {
      if (!data || !data.callId) return;
      socket.to(`call:${data.callId}`).emit('call:media-state', {
        socketId: socket.id,
        userId: socket.user._id,
        audio: !!data.audio,
        video: !!data.video,
        screen: !!data.screen,
      });
    });

    // Leave the mesh room explicitly.
    socket.on('call:leave', (data) => {
      if (!data || !data.callId) return;
      const room = `call:${data.callId}`;
      socket.to(room).emit('call:peer-left', {
        callId: data.callId,
        socketId: socket.id,
        userId: socket.user._id,
      });
      socket.leave(room);
    });

    // On disconnect, notify any call rooms this socket was part of.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (typeof room === 'string' && room.startsWith('call:')) {
          socket.to(room).emit('call:peer-left', {
            callId: room.slice('call:'.length),
            socketId: socket.id,
            userId: socket.user._id,
          });
        }
      }
    });

    // --- Read Receipts ---

    socket.on('message_read', (data) => {
      if (!data || !data.conversationId || !data.messageId) return;
      io.to(`conversation:${data.conversationId}`).emit('message_read', {
        messageId: data.messageId,
        userId: socket.user._id,
      });
    });

    // --- Disconnect ---

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.user.email}`);

      await UserPresence.findOneAndUpdate(
        { userId: socket.user._id },
        {
          status: 'offline',
          lastSeen: new Date(),
        }
      );

      io.to(`org:${socket.user.organizationId}`).emit('presence_update', {
        userId: socket.user._id,
        status: 'offline',
      });
    });
  });

  return io;
}

/**
 * Retrieve the current Socket.IO server instance.
 *
 * @returns {Server|undefined} The Socket.IO server, or undefined if not yet initialized
 */
export function getIO() {
  return io;
}
