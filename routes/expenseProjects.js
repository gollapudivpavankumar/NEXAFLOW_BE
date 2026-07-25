import express from 'express';
import ExpenseProject from '../models/ExpenseProject.js';
import Transaction from '../models/Transaction.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';

const router = express.Router();

// Get all expense projects for an organization
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const expenseProjects = await ExpenseProject.find({
      organizationId: req.params.organizationId
    })
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 });

    res.json({ expenseProjects });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single expense project
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const expenseProject = await ExpenseProject.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('createdBy', 'email');

    if (!expenseProject) {
      return res.status(404).json({ message: 'Expense project not found' });
    }

    res.json({ expenseProject });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create expense project
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, description, budget, startDate, endDate, status, taxSettings } = req.body;

    const expenseProject = await ExpenseProject.create({
      name,
      description,
      budget,
      startDate,
      endDate,
      status,
      taxSettings,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });

    res.status(201).json({ expenseProject });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update expense project
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { name, description, budget, startDate, endDate, status, taxSettings } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (budget !== undefined) updateData.budget = budget;
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (status !== undefined) updateData.status = status;
    if (taxSettings !== undefined) updateData.taxSettings = taxSettings;

    const expenseProject = await ExpenseProject.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.params.organizationId },
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'email');

    if (!expenseProject) {
      return res.status(404).json({ message: 'Expense project not found' });
    }

    res.json({ expenseProject });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete expense project
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const expenseProject = await ExpenseProject.findOneAndDelete({ _id: req.params.id, organizationId: req.params.organizationId });

    if (!expenseProject) {
      return res.status(404).json({ message: 'Expense project not found' });
    }

    // Clear the expenseProjectId reference on orphaned transactions
    await Transaction.updateMany(
      { expenseProjectId: req.params.id, organizationId: req.params.organizationId },
      { $unset: { expenseProjectId: '' } }
    );

    res.json({ message: 'Expense project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
