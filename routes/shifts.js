import express from 'express';
import ShiftTemplate from '../models/ShiftTemplate.js';
import ShiftAssignment from '../models/ShiftAssignment.js';
import ShiftSwapRequest from '../models/ShiftSwapRequest.js';
import Employee from '../models/Employee.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin, employeeOrOrgAdmin } from '../middleware/auth.js';

const router = express.Router();

// ==================== SHIFT TEMPLATES ====================

// @route   GET /api/shifts/:organizationId/templates
// @desc    Get all active shift templates
// @access  Protected
router.get('/:organizationId/templates', protect, checkOrganizationAccess, async (req, res) => {
  try {
    const templates = await ShiftTemplate.find({
      organizationId: req.params.organizationId,
      isActive: true
    }).sort({ createdAt: -1 });

    res.json({ templates });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/shifts/:organizationId/templates
// @desc    Admin creates shift template
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/templates', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { _id, ...templateData } = req.body;
    const template = await ShiftTemplate.create({
      ...templateData,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });

    res.status(201).json({ template });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/shifts/:organizationId/templates/:id
// @desc    Admin updates shift template
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/templates/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    // Prevent overwriting immutable fields
    const { organizationId: _orgId, _id, createdBy: _creator, ...updateData } = req.body;

    const template = await ShiftTemplate.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ message: 'Shift template not found' });
    }

    res.json({ template });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/shifts/:organizationId/templates/:id
// @desc    Admin soft-deletes shift template
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/templates/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const template = await ShiftTemplate.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      { isActive: false },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ message: 'Shift template not found' });
    }

    res.json({ message: 'Shift template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==================== SHIFT ASSIGNMENTS ====================

// @route   GET /api/shifts/:organizationId/assignments
// @desc    Admin gets all assignments with optional date range
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/assignments', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { organizationId: req.params.organizationId };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      query.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      query.date = { $lte: new Date(endDate) };
    }

    const assignments = await ShiftAssignment.find(query)
      .populate('employeeId', 'name email department')
      .populate('shiftTemplateId')
      .sort({ date: -1 });

    res.json({ assignments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/shifts/:organizationId/my-shifts
// @desc    Employee gets own shift assignments
// @access  Employee, OrgAdmin
router.get('/:organizationId/my-shifts', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const { startDate, endDate } = req.query;
    const query = {
      organizationId: req.params.organizationId,
      employeeId: req.user.employeeId
    };

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      query.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      query.date = { $lte: new Date(endDate) };
    }

    const assignments = await ShiftAssignment.find(query)
      .populate('shiftTemplateId')
      .sort({ date: -1 });

    res.json({ assignments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/shifts/:organizationId/assignments
// @desc    Admin assigns shift
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/assignments', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { employeeId, shiftTemplateId, date } = req.body;

    if (!employeeId || !shiftTemplateId || !date) {
      return res.status(400).json({ message: 'employeeId, shiftTemplateId, and date are required' });
    }

    const assignment = await ShiftAssignment.create({
      organizationId: req.params.organizationId,
      employeeId,
      shiftTemplateId,
      date,
      assignedBy: req.user._id
    });

    const populated = await ShiftAssignment.findById(assignment._id)
      .populate('employeeId', 'name email department')
      .populate('shiftTemplateId');

    res.status(201).json({ assignment: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/shifts/:organizationId/assignments/bulk
// @desc    Admin bulk assigns shifts
// @access  OrgAdmin, SuperAdmin
router.post('/:organizationId/assignments/bulk', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ message: 'Assignments array is required' });
    }

    const created = [];
    const skipped = [];

    for (const assignment of assignments) {
      try {
        // Check for duplicate (same employee + date)
        const existing = await ShiftAssignment.findOne({
          employeeId: assignment.employeeId,
          date: assignment.date,
          organizationId: req.params.organizationId
        });

        if (existing) {
          skipped.push({ ...assignment, reason: 'Duplicate assignment for employee on this date' });
          continue;
        }

        const newAssignment = await ShiftAssignment.create({
          organizationId: req.params.organizationId,
          employeeId: assignment.employeeId,
          shiftTemplateId: assignment.shiftTemplateId,
          date: assignment.date,
          assignedBy: req.user._id
        });

        created.push(newAssignment);
      } catch (err) {
        skipped.push({ ...assignment, reason: err.message });
      }
    }

    res.status(201).json({
      message: `Created ${created.length} assignments, skipped ${skipped.length}`,
      created,
      skipped
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/shifts/:organizationId/assignments/:id
// @desc    Admin updates assignment
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/assignments/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    // Prevent overwriting immutable fields
    const { organizationId: _orgId, _id, assignedBy: _assigner, ...updateData } = req.body;

    const assignment = await ShiftAssignment.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true }
    )
      .populate('employeeId', 'name email department')
      .populate('shiftTemplateId');

    if (!assignment) {
      return res.status(404).json({ message: 'Shift assignment not found' });
    }

    res.json({ assignment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/shifts/:organizationId/assignments/:id
// @desc    Admin deletes assignment
// @access  OrgAdmin, SuperAdmin
router.delete('/:organizationId/assignments/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const assignment = await ShiftAssignment.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Shift assignment not found' });
    }

    res.json({ message: 'Shift assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ==================== SHIFT SWAP REQUESTS ====================

// @route   POST /api/shifts/:organizationId/swap-requests
// @desc    Employee creates swap request
// @access  Employee, OrgAdmin
router.post('/:organizationId/swap-requests', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { requesterAssignmentId, targetEmployeeId, targetAssignmentId, reason } = req.body;

    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found for current user' });
    }

    if (!requesterAssignmentId || !targetEmployeeId || !targetAssignmentId) {
      return res.status(400).json({ message: 'requesterAssignmentId, targetEmployeeId, and targetAssignmentId are required' });
    }

    // Verify the requester's assignment belongs to them
    const requesterAssignment = await ShiftAssignment.findOne({
      _id: requesterAssignmentId,
      employeeId: req.user.employeeId,
      organizationId: req.params.organizationId
    });

    if (!requesterAssignment) {
      return res.status(400).json({ message: 'Requester assignment not found or does not belong to you' });
    }

    // Verify the target assignment belongs to the target employee
    const targetAssignment = await ShiftAssignment.findOne({
      _id: targetAssignmentId,
      employeeId: targetEmployeeId,
      organizationId: req.params.organizationId
    });

    if (!targetAssignment) {
      return res.status(400).json({ message: 'Target assignment not found or does not belong to the target employee' });
    }

    const swapRequest = await ShiftSwapRequest.create({
      organizationId: req.params.organizationId,
      requesterId: req.user.employeeId,
      requesterAssignmentId,
      targetEmployeeId,
      targetAssignmentId,
      reason
    });

    const populated = await ShiftSwapRequest.findById(swapRequest._id)
      .populate('requesterId', 'name email')
      .populate('targetEmployeeId', 'name email')
      .populate('requesterAssignmentId')
      .populate('targetAssignmentId');

    res.status(201).json({ swapRequest: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/shifts/:organizationId/swap-requests
// @desc    Admin gets all swap requests
// @access  OrgAdmin, SuperAdmin
router.get('/:organizationId/swap-requests', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const swapRequests = await ShiftSwapRequest.find({
      organizationId: req.params.organizationId
    })
      .populate('requesterId', 'name email')
      .populate('targetEmployeeId', 'name email')
      .populate('requesterAssignmentId')
      .populate('targetAssignmentId')
      .sort({ createdAt: -1 });

    res.json({ swapRequests });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/shifts/:organizationId/swap-requests/my
// @desc    Employee gets own swap requests
// @access  Employee, OrgAdmin
router.get('/:organizationId/swap-requests/my', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const swapRequests = await ShiftSwapRequest.find({
      organizationId: req.params.organizationId,
      $or: [
        { requesterId: req.user.employeeId },
        { targetEmployeeId: req.user.employeeId }
      ]
    })
      .populate('requesterId', 'name email')
      .populate('targetEmployeeId', 'name email')
      .populate('requesterAssignmentId')
      .populate('targetAssignmentId')
      .sort({ createdAt: -1 });

    res.json({ swapRequests });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/shifts/:organizationId/swap-requests/:id/peer-approve
// @desc    Target employee approves swap
// @access  Employee, OrgAdmin
router.put('/:organizationId/swap-requests/:id/peer-approve', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(400).json({ message: 'Employee ID not found' });
    }

    const swapRequest = await ShiftSwapRequest.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!swapRequest) {
      return res.status(404).json({ message: 'Swap request not found' });
    }

    // Verify the current user is the target employee (the peer being asked to swap)
    if (swapRequest.targetEmployeeId.toString() !== req.user.employeeId.toString()) {
      return res.status(403).json({ message: 'Only the target employee can peer-approve this swap request' });
    }

    if (swapRequest.status !== 'pending_peer') {
      return res.status(400).json({ message: 'Swap request is not pending peer approval' });
    }

    swapRequest.peerApproved = true;
    swapRequest.peerApprovedDate = new Date();
    swapRequest.status = 'pending_admin';
    await swapRequest.save();

    const populatedSwap = await ShiftSwapRequest.findById(swapRequest._id)
      .populate('requesterId', 'name email')
      .populate('targetEmployeeId', 'name email')
      .populate('requesterAssignmentId')
      .populate('targetAssignmentId');

    res.json({ swapRequest: populatedSwap });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/shifts/:organizationId/swap-requests/:id/admin-approve
// @desc    Admin approves swap and swaps the shifts
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/swap-requests/:id/admin-approve', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const swapRequest = await ShiftSwapRequest.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!swapRequest) {
      return res.status(404).json({ message: 'Swap request not found' });
    }

    if (swapRequest.status !== 'pending_admin') {
      return res.status(400).json({ message: 'Swap request is not pending admin approval' });
    }

    // Get both assignments
    const requesterAssignment = await ShiftAssignment.findById(swapRequest.requesterAssignmentId);
    const targetAssignment = await ShiftAssignment.findById(swapRequest.targetAssignmentId);

    if (!requesterAssignment || !targetAssignment) {
      return res.status(404).json({ message: 'One or both shift assignments not found' });
    }

    // Swap the employees on the assignments so each takes the other's shift slot
    const tempEmployeeId = requesterAssignment.employeeId;
    requesterAssignment.employeeId = targetAssignment.employeeId;
    targetAssignment.employeeId = tempEmployeeId;

    requesterAssignment.status = 'swapped';
    targetAssignment.status = 'swapped';

    // Use bulkWrite to avoid unique index conflicts during intermediate saves
    await ShiftAssignment.bulkWrite([
      {
        updateOne: {
          filter: { _id: requesterAssignment._id },
          update: { $set: { employeeId: requesterAssignment.employeeId, status: 'swapped' } }
        }
      },
      {
        updateOne: {
          filter: { _id: targetAssignment._id },
          update: { $set: { employeeId: targetAssignment.employeeId, status: 'swapped' } }
        }
      }
    ]);

    // Update swap request
    swapRequest.status = 'approved';
    swapRequest.adminApprovedBy = req.user._id;
    swapRequest.adminApprovedDate = new Date();
    await swapRequest.save();

    // Re-fetch populated data after the swap
    const populatedSwap = await ShiftSwapRequest.findById(swapRequest._id)
      .populate('requesterId', 'name email')
      .populate('targetEmployeeId', 'name email')
      .populate('requesterAssignmentId')
      .populate('targetAssignmentId');

    const updatedRequesterAssignment = await ShiftAssignment.findById(swapRequest.requesterAssignmentId)
      .populate('employeeId', 'name email department')
      .populate('shiftTemplateId');

    const updatedTargetAssignment = await ShiftAssignment.findById(swapRequest.targetAssignmentId)
      .populate('employeeId', 'name email department')
      .populate('shiftTemplateId');

    res.json({
      swapRequest: populatedSwap,
      requesterAssignment: updatedRequesterAssignment,
      targetAssignment: updatedTargetAssignment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/shifts/:organizationId/swap-requests/:id/reject
// @desc    Admin rejects swap request
// @access  OrgAdmin, SuperAdmin
router.put('/:organizationId/swap-requests/:id/reject', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const swapRequest = await ShiftSwapRequest.findOne({
      _id: req.params.id,
      organizationId: req.params.organizationId
    });

    if (!swapRequest) {
      return res.status(404).json({ message: 'Swap request not found' });
    }

    if (['approved', 'rejected', 'cancelled'].includes(swapRequest.status)) {
      return res.status(400).json({ message: `Cannot reject a swap request that is already ${swapRequest.status}` });
    }

    swapRequest.status = 'rejected';
    swapRequest.comments = req.body.comments || '';
    swapRequest.adminApprovedBy = req.user._id;
    swapRequest.adminApprovedDate = new Date();
    await swapRequest.save();

    const populatedSwap = await ShiftSwapRequest.findById(swapRequest._id)
      .populate('requesterId', 'name email')
      .populate('targetEmployeeId', 'name email')
      .populate('requesterAssignmentId')
      .populate('targetAssignmentId');

    res.json({ swapRequest: populatedSwap });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
