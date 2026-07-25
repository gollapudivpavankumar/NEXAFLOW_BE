import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import CallLog from '../models/CallLog.js';
import UserPresence from '../models/UserPresence.js';
import { protect, employeeOrOrgAdmin, checkOrganizationAccess, orgAdminOrSuperAdmin } from '../middleware/auth.js';
import { createCall, endCall, generateUserToken, getApiKey, upsertUser } from '../services/dailyService.js';

const router = express.Router();

// @route   GET /api/chat/:organizationId/conversations
// @desc    Get all conversations for current user
// @access  Employee, OrgAdmin
router.get('/:organizationId/conversations', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { search } = req.query;
    const userId = req.user._id;

    let query = {
      organizationId,
      participants: userId
    };

    const conversations = await Conversation.find(query)
      .populate('participants', 'email role name')
      .sort({ lastMessageAt: -1 });

    // Filter by search term if provided
    let filteredConversations = conversations;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredConversations = conversations.filter(conv => {
        // For channels/groups, also search by channel name
        if (conv.name && conv.name.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Search across all other participants
        const otherUsers = conv.participants.filter(p => p._id.toString() !== userId.toString());
        const matchesParticipant = otherUsers.some(u =>
          u?.email?.toLowerCase().includes(searchLower) ||
          u?.name?.toLowerCase().includes(searchLower)
        );
        return matchesParticipant ||
               conv.lastMessageText?.toLowerCase().includes(searchLower);
      });
    }

    res.json({ conversations: filteredConversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/chat/:organizationId/conversations
// @desc    Start new conversation or get existing one
// @access  Employee, OrgAdmin
router.post('/:organizationId/conversations', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { participantId } = req.body;
    const userId = req.user._id;

    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }

    if (participantId === userId.toString()) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself' });
    }

    // Check if conversation already exists
    const existing = await Conversation.findOne({
      organizationId,
      participants: { $all: [userId, participantId] }
    }).populate('participants', 'email role name');

    if (existing) {
      return res.json({ conversation: existing });
    }

    // Verify participant exists and belongs to same org
    const participant = await User.findById(participantId);
    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    if (!participant.organizationId || participant.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Cannot start conversation with user from different organization' });
    }

    // Create new conversation
    const conversation = await Conversation.create({
      participants: [userId, participantId],
      organizationId
    });

    const populated = await Conversation.findById(conversation._id).populate('participants', 'email role name');
    res.status(201).json({ conversation: populated });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/chat/:organizationId/conversations/:conversationId/messages
// @desc    Get messages for a conversation
// @access  Employee, OrgAdmin (participant only)
router.get('/:organizationId/conversations/:conversationId/messages', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, conversationId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user._id;

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      organizationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to this conversation' });
    }

    let query = { conversationId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'email role name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Mark messages as read by current user
    const unreadMessages = messages.filter(msg =>
      msg.senderId && msg.senderId._id &&
      msg.senderId._id.toString() !== userId.toString() &&
      !msg.readBy.some(r => r.userId.toString() === userId.toString())
    );

    if (unreadMessages.length > 0) {
      await Message.updateMany(
        {
          _id: { $in: unreadMessages.map(m => m._id) },
          'readBy.userId': { $ne: userId }
        },
        {
          $push: { readBy: { userId, readAt: new Date() } }
        }
      );
    }

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/chat/:organizationId/messages
// @desc    Send a message
// @access  Employee, OrgAdmin
router.post('/:organizationId/messages', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { conversationId, content, attachments, replyTo } = req.body;
    const userId = req.user._id;

    // At least content or attachments required
    if (!conversationId || (!content && (!attachments || attachments.length === 0))) {
      return res.status(400).json({ message: 'Conversation ID and message content or attachments are required' });
    }

    // Validate attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (!attachment.filename || !attachment.fileData || !attachment.fileType || !attachment.fileSize) {
          return res.status(400).json({ message: 'Invalid attachment format' });
        }
        // Check file size (10MB limit)
        if (attachment.fileSize > 10 * 1024 * 1024) {
          return res.status(400).json({ message: `File ${attachment.filename} exceeds 10MB limit` });
        }
      }
      // Limit number of attachments per message
      if (attachments.length > 5) {
        return res.status(400).json({ message: 'Maximum 5 attachments per message allowed' });
      }
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      organizationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to this conversation' });
    }

    // Create message with attachments
    const messageData = {
      conversationId,
      senderId: userId,
      content: content || '',
      attachments: attachments || [],
      replyTo: replyTo || undefined
    };

    const message = await Message.create(messageData);

    // Update conversation
    conversation.lastMessageAt = new Date();
    if (content) {
      conversation.lastMessageText = content.substring(0, 100);
    } else if (attachments && attachments.length > 0) {
      conversation.lastMessageText = `📎 ${attachments.length} attachment(s)`;
    }
    await conversation.save();

    const populated = await Message.findById(message._id).populate('senderId', 'email role name');

    // Create notification for the recipient
    const recipientId = conversation.participants.find(p => p.toString() !== userId.toString());
    if (recipientId) {
      try {
        await Notification.create({
          userId: recipientId,
          organizationId,
          type: 'message',
          title: 'New Message',
          message: `You have a new message from ${req.user.email || req.user.name}`,
          link: `/messages`,
          relatedId: conversation._id
        });
      } catch (notifError) {
        console.error('Failed to create notification:', notifError);
        // Don't fail the message send if notification fails
      }
    }

    res.status(201).json({ message: populated });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/chat/:organizationId/messages/:id/read
// @desc    Mark message as read
// @access  Employee, OrgAdmin
router.put('/:organizationId/messages/:id/read', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(id).populate({
      path: 'conversationId',
      match: { organizationId, participants: userId }
    });

    if (!message || !message.conversationId) {
      return res.status(403).json({ message: 'Access denied to this message' });
    }

    // Only mark as read if user is not the sender and hasn't read it yet
    if (message.senderId.toString() !== userId.toString() &&
        !message.readBy.some(r => r.userId.toString() === userId.toString())) {
      message.readBy.push({ userId, readAt: new Date() });
      await message.save();
    }

    res.json({ message });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/chat/:organizationId/users
// @desc    Get all users in organization for starting conversations
// @access  Employee, OrgAdmin
router.get('/:organizationId/users', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user._id;

    const users = await User.find({
      organizationId,
      _id: { $ne: userId }
    }).select('email role name');

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/chat/:organizationId/unread-count
// @desc    Get count of unread messages for current user
// @access  Employee, OrgAdmin
router.get('/:organizationId/unread-count', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user._id;

    // Get all conversations for this user
    const conversations = await Conversation.find({
      organizationId,
      participants: userId
    }).select('_id');

    const conversationIds = conversations.map(c => c._id);

    // Count unread messages (messages not sent by user and not in readBy array)
    const unreadCount = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      'readBy.userId': { $ne: userId }
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================================
// CHANNEL / GROUP CONVERSATION ENDPOINTS
// ============================================================================

// @route   POST /api/chat/:organizationId/channels
// @desc    Create a channel or group conversation
// @access  Employee, OrgAdmin
router.post('/:organizationId/channels', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { name, description, isPrivate, participantIds } = req.body;
    const userId = req.user._id;

    if (!name) {
      return res.status(400).json({ message: 'Channel name is required' });
    }

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ message: 'At least one participant is required' });
    }

    // Verify all participants exist and belong to the organization
    const participants = await User.find({
      _id: { $in: participantIds },
      organizationId
    }).select('_id');

    if (participants.length !== participantIds.length) {
      return res.status(400).json({ message: 'One or more participants not found in this organization' });
    }

    // Ensure the creator is included in participants
    const allParticipants = [...new Set([userId.toString(), ...participantIds])];

    // Determine type based on participant count
    const type = allParticipants.length > 2 ? 'channel' : 'group';

    const conversation = await Conversation.create({
      organizationId,
      name,
      description: description || '',
      type,
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      participants: allParticipants,
      createdBy: userId,
      admins: [userId]
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'email role name')
      .populate('createdBy', 'email role name')
      .populate('admins', 'email role name');

    res.status(201).json({ conversation: populated });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/chat/:organizationId/channels/:channelId
// @desc    Update channel info (name, description)
// @access  Employee, OrgAdmin (channel admins or creator only)
router.put('/:organizationId/channels/:channelId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, channelId } = req.params;
    const { name, description } = req.body;
    const userId = req.user._id;

    const conversation = await Conversation.findOne({
      _id: channelId,
      organizationId,
      type: { $in: ['channel', 'group'] }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Only admins or the creator can update
    const isAdmin = conversation.admins.some(a => a.toString() === userId.toString());
    const isCreator = conversation.createdBy && conversation.createdBy.toString() === userId.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only channel admins or the creator can update channel info' });
    }

    if (name !== undefined) conversation.name = name;
    if (description !== undefined) conversation.description = description;

    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'email role name')
      .populate('createdBy', 'email role name')
      .populate('admins', 'email role name');

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Update channel error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   POST /api/chat/:organizationId/channels/:channelId/members
// @desc    Add members to a channel
// @access  Employee, OrgAdmin
router.post('/:organizationId/channels/:channelId/members', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, channelId } = req.params;
    const { userIds } = req.body;
    const userId = req.user._id;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds array is required' });
    }

    const conversation = await Conversation.findOne({
      _id: channelId,
      organizationId,
      type: { $in: ['channel', 'group'] }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Verify all users exist in the organization
    const users = await User.find({
      _id: { $in: userIds },
      organizationId
    }).select('_id');

    if (users.length !== userIds.length) {
      return res.status(400).json({ message: 'One or more users not found in this organization' });
    }

    // Add users to participants using $addToSet to avoid duplicates
    await Conversation.findByIdAndUpdate(channelId, {
      $addToSet: { participants: { $each: userIds } }
    });

    const populated = await Conversation.findById(channelId)
      .populate('participants', 'email role name')
      .populate('createdBy', 'email role name')
      .populate('admins', 'email role name');

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/chat/:organizationId/channels/:channelId/members/:userId
// @desc    Remove a member from a channel
// @access  Employee, OrgAdmin (channel admins or creator only)
router.delete('/:organizationId/channels/:channelId/members/:userId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, channelId, userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    const conversation = await Conversation.findOne({
      _id: channelId,
      organizationId,
      type: { $in: ['channel', 'group'] }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Only admins or the creator can remove members
    const isAdmin = conversation.admins.some(a => a.toString() === currentUserId.toString());
    const isCreator = conversation.createdBy && conversation.createdBy.toString() === currentUserId.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Only channel admins or the creator can remove members' });
    }

    // Cannot remove the creator
    if (conversation.createdBy && conversation.createdBy.toString() === targetUserId) {
      return res.status(400).json({ message: 'Cannot remove the channel creator' });
    }

    // Remove user from participants using $pull
    await Conversation.findByIdAndUpdate(channelId, {
      $pull: { participants: targetUserId, admins: targetUserId }
    });

    const populated = await Conversation.findById(channelId)
      .populate('participants', 'email role name')
      .populate('createdBy', 'email role name')
      .populate('admins', 'email role name');

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ============================================================================
// MESSAGE EDIT / DELETE ENDPOINTS
// ============================================================================

// @route   PUT /api/chat/:organizationId/messages/:id/edit
// @desc    Edit a message (sender only)
// @access  Employee, OrgAdmin
router.put('/:organizationId/messages/:id/edit', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const message = await Message.findById(id).populate({
      path: 'conversationId',
      match: { organizationId }
    });

    if (!message || !message.conversationId) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only the sender can edit
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the sender can edit this message' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }

    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id).populate('senderId', 'email role name');

    res.json({ message: populated });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/chat/:organizationId/messages/:id
// @desc    Soft delete a message (sender only)
// @access  Employee, OrgAdmin
router.delete('/:organizationId/messages/:id', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(id).populate({
      path: 'conversationId',
      match: { organizationId }
    });

    if (!message || !message.conversationId) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only the sender can delete
    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the sender can delete this message' });
    }

    message.isDeleted = true;
    message.content = 'This message was deleted';
    message.attachments = [];
    await message.save();

    res.json({ message: { _id: message._id, isDeleted: true, content: 'This message was deleted' } });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ============================================================================
// MESSAGE REACTIONS ENDPOINT
// ============================================================================

// @route   POST /api/chat/:organizationId/messages/:id/reactions
// @desc    Toggle a reaction on a message (add if not present, remove if already reacted)
// @access  Employee, OrgAdmin
router.post('/:organizationId/messages/:id/reactions', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await Message.findById(id).populate({
      path: 'conversationId',
      match: { organizationId, participants: userId }
    });

    if (!message || !message.conversationId) {
      return res.status(403).json({ message: 'Access denied to this message' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: 'Cannot react to a deleted message' });
    }

    // Check if user already reacted with the same emoji
    const existingReactionIndex = message.reactions.findIndex(
      r => r.userId.toString() === userId.toString() && r.emoji === emoji
    );

    if (existingReactionIndex > -1) {
      // Remove the reaction (toggle off)
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      // Add the reaction
      message.reactions.push({ userId, emoji, createdAt: new Date() });
    }

    await message.save();

    const populated = await Message.findById(message._id)
      .populate('senderId', 'email role name')
      .populate('reactions.userId', 'email role name');

    res.json({ message: populated });
  } catch (error) {
    console.error('Toggle reaction error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ============================================================================
// REPLY TO MESSAGE ENDPOINT
// ============================================================================

// @route   POST /api/chat/:organizationId/messages/:id/reply
// @desc    Reply to a message (creates a new message with replyTo reference)
// @access  Employee, OrgAdmin
router.post('/:organizationId/messages/:id/reply', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { content, attachments } = req.body;
    const userId = req.user._id;

    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message content or attachments are required' });
    }

    // Find the parent message and verify access
    const parentMessage = await Message.findById(id).populate({
      path: 'conversationId',
      match: { organizationId, participants: userId }
    });

    if (!parentMessage || !parentMessage.conversationId) {
      return res.status(403).json({ message: 'Access denied to this message' });
    }

    const conversationId = parentMessage.conversationId._id;

    // Create the reply message
    const replyData = {
      conversationId,
      senderId: userId,
      content: content || '',
      attachments: attachments || [],
      replyTo: id
    };

    const reply = await Message.create(replyData);

    // Update conversation
    const conversation = await Conversation.findById(conversationId);
    conversation.lastMessageAt = new Date();
    if (content) {
      conversation.lastMessageText = content.substring(0, 100);
    } else if (attachments && attachments.length > 0) {
      conversation.lastMessageText = `📎 ${attachments.length} attachment(s)`;
    }
    await conversation.save();

    const populated = await Message.findById(reply._id)
      .populate('senderId', 'email role name')
      .populate('replyTo');

    res.status(201).json({ message: populated });
  } catch (error) {
    console.error('Reply to message error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ============================================================================
// PIN / UNPIN MESSAGE ENDPOINTS
// ============================================================================

// @route   POST /api/chat/:organizationId/conversations/:conversationId/pin/:messageId
// @desc    Pin a message in a conversation
// @access  Employee, OrgAdmin
router.post('/:organizationId/conversations/:conversationId/pin/:messageId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, conversationId, messageId } = req.params;
    const userId = req.user._id;

    // Verify user is participant in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      organizationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to this conversation' });
    }

    // Verify the message belongs to this conversation
    const message = await Message.findOne({
      _id: messageId,
      conversationId
    });

    if (!message) {
      return res.status(404).json({ message: 'Message not found in this conversation' });
    }

    // Add to pinnedMessages if not already pinned
    if (!conversation.pinnedMessages.some(pm => pm.toString() === messageId)) {
      conversation.pinnedMessages.push(messageId);
      await conversation.save();
    }

    const populated = await Conversation.findById(conversationId)
      .populate('participants', 'email role name')
      .populate('pinnedMessages');

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/chat/:organizationId/conversations/:conversationId/pin/:messageId
// @desc    Unpin a message from a conversation
// @access  Employee, OrgAdmin
router.delete('/:organizationId/conversations/:conversationId/pin/:messageId', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, conversationId, messageId } = req.params;
    const userId = req.user._id;

    // Verify user is participant in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      organizationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to this conversation' });
    }

    // Remove from pinnedMessages using $pull
    await Conversation.findByIdAndUpdate(conversationId, {
      $pull: { pinnedMessages: messageId }
    });

    const populated = await Conversation.findById(conversationId)
      .populate('participants', 'email role name')
      .populate('pinnedMessages');

    res.json({ conversation: populated });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ============================================================================
// CALL MANAGEMENT ENDPOINTS (GetStream.io Video integration)
// ============================================================================

// @route   POST /api/chat/:organizationId/calls/start
// @desc    Start a call (create a GetStream Video call and CallLog)
// @access  Employee, OrgAdmin
router.post('/:organizationId/calls/start', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { conversationId, callType } = req.body;
    const userId = req.user._id;

    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId is required' });
    }

    if (!callType || !['audio', 'video', 'screen_share'].includes(callType)) {
      return res.status(400).json({ message: 'callType must be audio, video, or screen_share' });
    }

    // Verify user is participant in the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      organizationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to this conversation' });
    }

    // Stream requires call ids <= 64 chars. conversationId (a 24-char ObjectId)
    // is already globally unique, so scope by it plus a base36 timestamp.
    // e.g. "call-6903...c7a-lx8k2p" (~38 chars).
    const callId = `call-${conversationId}-${Date.now().toString(36)}`;

    // Upsert caller on Stream
    await upsertUser(userId.toString(), req.user.name || req.user.email);

    // Get participant user IDs from conversation
    const participantUserIds = conversation.participants
      .map(p => p.toString())
      .filter(p => p !== userId.toString());

    // Create the Stream call
    const streamCall = await createCall(callId, userId.toString(), participantUserIds);

    // Generate token for the caller
    const userToken = generateUserToken(userId.toString());

    // Create the call log
    const callLog = await CallLog.create({
      organizationId,
      conversationId,
      initiatedBy: userId,
      callType,
      streamCallId: callId,
      streamCallType: 'default',
      status: 'ringing',
      startedAt: new Date(),
      participants: [{
        userId,
        joinedAt: new Date()
      }]
    });

    const populated = await CallLog.findById(callLog._id)
      .populate('initiatedBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.status(201).json({
      call: populated,
      callId,
      token: userToken,
      apiKey: getApiKey()
    });
  } catch (error) {
    console.error('Start call error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/chat/:organizationId/calls/:callId/join
// @desc    Join an existing call
// @access  Employee, OrgAdmin
router.put('/:organizationId/calls/:callId/join', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, callId } = req.params;
    const userId = req.user._id;

    const callLog = await CallLog.findOne({
      _id: callId,
      organizationId,
      status: { $in: ['ringing', 'active'] }
    });

    if (!callLog) {
      return res.status(404).json({ message: 'Call not found or already ended' });
    }

    // Check if user is already a participant
    const alreadyJoined = callLog.participants.some(
      p => p.userId.toString() === userId.toString() && !p.leftAt
    );

    if (!alreadyJoined) {
      callLog.participants.push({
        userId,
        joinedAt: new Date()
      });
    }

    // Update status to active if this is the first joiner (beyond the initiator)
    if (callLog.status === 'ringing') {
      callLog.status = 'active';
    }

    await callLog.save();

    // Upsert user on Stream and generate token
    await upsertUser(userId.toString(), req.user.name || req.user.email);
    const userToken = generateUserToken(userId.toString());

    const populated = await CallLog.findById(callLog._id)
      .populate('initiatedBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.json({
      call: populated,
      callId: callLog.streamCallId,
      token: userToken,
      apiKey: getApiKey()
    });
  } catch (error) {
    console.error('Join call error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   PUT /api/chat/:organizationId/calls/:callId/end
// @desc    End a call
// @access  Employee, OrgAdmin
router.put('/:organizationId/calls/:callId/end', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId, callId } = req.params;
    const userId = req.user._id;

    const callLog = await CallLog.findOne({
      _id: callId,
      organizationId,
      status: { $in: ['ringing', 'active'] }
    });

    if (!callLog) {
      return res.status(404).json({ message: 'Call not found or already ended' });
    }

    // Set end time and calculate duration
    const endedAt = new Date();
    const startedAt = callLog.startedAt || callLog.createdAt;
    const duration = Math.round((endedAt - startedAt) / 1000); // duration in seconds

    callLog.status = 'ended';
    callLog.endedAt = endedAt;
    callLog.duration = duration;

    // Mark all active participants as having left
    callLog.participants.forEach(p => {
      if (!p.leftAt) {
        p.leftAt = endedAt;
        p.duration = Math.round((endedAt - p.joinedAt) / 1000);
      }
    });

    await callLog.save();

    // End the Stream call
    if (callLog.streamCallId) {
      try {
        await endCall(callLog.streamCallId, callLog.streamCallType || 'default');
      } catch (endError) {
        console.error('Failed to end Stream call:', endError.message);
      }
    }

    const populated = await CallLog.findById(callLog._id)
      .populate('initiatedBy', 'email role name')
      .populate('participants.userId', 'email role name');

    res.json({ call: populated });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// ============================================================================
// USER PRESENCE ENDPOINTS
// ============================================================================

// @route   PUT /api/chat/:organizationId/presence
// @desc    Update current user's presence status
// @access  Employee, OrgAdmin
router.put('/:organizationId/presence', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    if (!status || !['online', 'away', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({ message: 'Status must be one of: online, away, busy, offline' });
    }

    const presence = await UserPresence.findOneAndUpdate(
      { userId },
      {
        userId,
        organizationId,
        status,
        lastSeen: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ presence });
  } catch (error) {
    console.error('Update presence error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// @route   GET /api/chat/:organizationId/presence
// @desc    Get presence status for all users in the organization
// @access  Employee, OrgAdmin
router.get('/:organizationId/presence', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Get all users in the organization
    const orgUsers = await User.find({ organizationId }).select('_id');
    const orgUserIds = orgUsers.map(u => u._id);

    // Find presence records for all org users
    const presenceRecords = await UserPresence.find({
      userId: { $in: orgUserIds }
    }).populate('userId', 'email role name');

    const presenceList = presenceRecords.map(p => ({
      userId: p.userId,
      status: p.status,
      lastSeen: p.lastSeen
    }));

    res.json({ presence: presenceList });
  } catch (error) {
    console.error('Get presence error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

export default router;
