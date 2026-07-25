import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import SupportTicket from '../models/SupportTicket.js';
import Employee from '../models/Employee.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/support-tickets';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only images and documents are allowed.'));
  }
});

// Get ticket statistics (admin) - MUST come before /:organizationId/:id
router.get('/:organizationId/stats/overview', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ organizationId: req.params.organizationId });

    const stats = {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'Open').length,
      inProgress: tickets.filter(t => t.status === 'In Progress').length,
      resolved: tickets.filter(t => t.status === 'Resolved').length,
      closed: tickets.filter(t => t.status === 'Closed').length,
      reopened: tickets.filter(t => t.status === 'Reopened').length,
      byCategory: {
        HR: tickets.filter(t => t.category === 'HR').length,
        IT: tickets.filter(t => t.category === 'IT').length,
        Payroll: tickets.filter(t => t.category === 'Payroll').length,
        Leave: tickets.filter(t => t.category === 'Leave').length,
        Asset: tickets.filter(t => t.category === 'Asset').length,
        Other: tickets.filter(t => t.category === 'Other').length
      },
      byPriority: {
        Low: tickets.filter(t => t.priority === 'Low').length,
        Medium: tickets.filter(t => t.priority === 'Medium').length,
        High: tickets.filter(t => t.priority === 'High').length,
        Urgent: tickets.filter(t => t.priority === 'Urgent').length
      }
    };

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all tickets
router.get('/:organizationId', protect, checkOrganizationAccess, async (req, res) => {
  try {
    let query = { organizationId: req.params.organizationId };

    // Employees see only their tickets
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      query.employeeId = employee._id;
    }

    const tickets = await SupportTicket.find(query)
      .populate('employeeId', 'name email')
      .populate('assignedTo', 'email')
      .populate('resolvedBy', 'email')
      .populate('comments.userId', 'email')
      .sort({ createdAt: -1 });

    // Filter out internal comments for employees
    const sanitizedTickets = tickets.map(ticket => {
      const ticketObj = ticket.toObject();
      if (req.user.role === 'employee') {
        ticketObj.comments = ticketObj.comments.filter(c => !c.isInternal);
      }
      return ticketObj;
    });

    res.json({ tickets: sanitizedTickets });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get ticket by ID
router.get('/:organizationId/:id', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('employeeId', 'name email')
      .populate('assignedTo', 'email')
      .populate('resolvedBy', 'email')
      .populate('comments.userId', 'email');

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Check access permissions
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee || ticket.employeeId._id.toString() !== employee._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Filter out internal comments for employees
    const ticketObj = ticket.toObject();
    if (req.user.role === 'employee') {
      ticketObj.comments = ticketObj.comments.filter(c => !c.isInternal);
    }

    res.json({ ticket: ticketObj });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create ticket (employee)
router.post('/:organizationId', protect, checkOrganizationAccess, upload.array('attachments', 5), async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.user._id });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const attachments = req.files ? req.files.map(file => `/uploads/support-tickets/${file.filename}`) : [];

    const { subject, description, category, priority } = req.body;

    const ticket = await SupportTicket.create({
      subject,
      description,
      category,
      priority,
      organizationId: req.params.organizationId,
      employeeId: employee._id,
      attachments
    });

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('employeeId', 'name email');

    res.status(201).json({ ticket: populatedTicket });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add comment to ticket
router.post('/:organizationId/:id/comment', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { message, isInternal } = req.body;
    const ticket = await SupportTicket.findOne({ _id: req.params.id, organizationId: req.params.organizationId });

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    // Check access permissions
    if (req.user.role === 'employee') {
      const employee = await Employee.findOne({ userId: req.user._id });
      if (!employee || ticket.employeeId.toString() !== employee._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    ticket.comments.push({
      userId: req.user._id,
      message,
      isInternal: req.user.role !== 'employee' ? isInternal : false,
      timestamp: new Date()
    });

    await ticket.save();

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate('employeeId', 'name email')
      .populate('assignedTo', 'email')
      .populate('comments.userId', 'email');

    // Filter out internal comments for employees
    const ticketObj = updatedTicket.toObject();
    if (req.user.role === 'employee') {
      ticketObj.comments = ticketObj.comments.filter(c => !c.isInternal);
    }

    res.json({ ticket: ticketObj });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Assign ticket (admin or reporting manager)
router.put('/:organizationId/:id/assign', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { assignedTo } = req.body;

    // Check if user has permission
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      { assignedTo },
      { new: true }
    ).populate('employeeId', 'name email')
      .populate('assignedTo', 'email');

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update ticket status
router.put('/:organizationId/:id/status', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const { status, resolution } = req.body;

    // Check if user has permission
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updateData = { status };

    if (status === 'Resolved' || status === 'Closed') {
      updateData.resolvedBy = req.user._id;
      updateData.resolvedDate = new Date();
      if (resolution) {
        updateData.resolution = resolution;
      }
    } else if (status === 'Reopened' || status === 'Open' || status === 'In Progress') {
      // Clear resolution fields when reopening or moving back to active status
      updateData.resolvedBy = null;
      updateData.resolvedDate = null;
      updateData.resolution = null;
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true }
    ).populate('employeeId', 'name email')
      .populate('assignedTo', 'email')
      .populate('resolvedBy', 'email');

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update ticket priority (admin)
router.put('/:organizationId/:id/priority', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { priority } = req.body;
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      { priority },
      { new: true }
    ).populate('employeeId', 'name email')
      .populate('assignedTo', 'email');

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete ticket (admin only)
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndDelete({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
