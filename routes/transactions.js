import express from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { protect, orgAdminOrSuperAdmin, checkOrganizationAccess } from '../middleware/auth.js';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

const router = express.Router();

// Get analytics/statistics - Must be before /:organizationId/:id route
router.get('/:organizationId/analytics/summary', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { fromDate, toDate, expenseProjectId } = req.query;

    let query = { organizationId: req.params.organizationId };

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.date.$lte = endOfDay;
      }
    }

    if (expenseProjectId) {
      query.expenseProjectId = expenseProjectId;
    }

    const transactions = await Transaction.find(query).sort({ date: 1 });

    // Calculate totals
    const totalDebits = transactions
      .filter(t => t.transactionType === 'Debit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalCredits = transactions
      .filter(t => t.transactionType === 'Credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const netCashFlow = totalCredits - totalDebits;

    // Monthly aggregation
    const monthlyData = {};

    transactions.forEach(t => {
      const monthKey = t.date.toISOString().substring(0, 7); // YYYY-MM

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          debits: 0,
          credits: 0,
          netFlow: 0,
          transactionCount: 0
        };
      }

      monthlyData[monthKey].transactionCount++;

      if (t.transactionType === 'Debit') {
        monthlyData[monthKey].debits += t.amount;
      } else {
        monthlyData[monthKey].credits += t.amount;
      }

      monthlyData[monthKey].netFlow = monthlyData[monthKey].credits - monthlyData[monthKey].debits;
    });

    // Convert to array and sort by month (ascending)
    const monthlyTotals = Object.values(monthlyData).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    res.json({
      summary: {
        totalTransactions: transactions.length,
        totalDebits,
        totalCredits,
        netCashFlow,
        currentBalance: transactions.length > 0 ? transactions[transactions.length - 1].balance : 0
      },
      monthlyTotals
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get import batches list
router.get('/:organizationId/batches', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const batches = await Transaction.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(req.params.organizationId),
          importBatchId: { $exists: true, $ne: null }
        }
      },
      {
        $lookup: {
          from: 'expenseprojects',
          localField: 'expenseProjectId',
          foreignField: '_id',
          as: 'expenseProject'
        }
      },
      {
        $group: {
          _id: '$importBatchId',
          expenseProjectId: { $first: '$expenseProjectId' },
          expenseProjectName: { $first: { $arrayElemAt: ['$expenseProject.name', 0] } },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          importDate: { $first: '$createdAt' }
        }
      },
      { $sort: { importDate: -1 } }
    ]);

    res.json({ batches });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Export transactions to CSV
router.get('/:organizationId/export/csv', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    let query = { organizationId: req.params.organizationId };

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.date.$lte = endOfDay;
      }
    }

    const transactions = await Transaction.find(query).sort({ date: -1 });

    // Build CSV
    const header = 'Filter,Date,Description,Sub-description,Type of Transaction,Amount,Balance,HST Amount,Net Amount,Comments\n';
    const filterRow = `"Custom filters (select dates and amounts), From date=${fromDate || ''}, To date=${toDate || ''}"\n`;

    const escCsv = (val) => (val || '').replace(/"/g, '""');
    const rows = transactions.map(t => {
      const amount = t.transactionType === 'Debit' ? -t.amount : t.amount;
      return `,"${t.date.toISOString().split('T')[0]}","${escCsv(t.description)}","${escCsv(t.subDescription)}",${t.transactionType},${amount.toFixed(2)},${(t.balance || 0).toFixed(2)},${(t.hstAmount || 0).toFixed(2)},${(t.netAmount || 0).toFixed(2)},"${escCsv(t.comments)}"`;
    }).join('\n');

    const csv = header + filterRow + rows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all transactions with filters
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { fromDate, toDate, transactionType, expenseProjectId } = req.query;

    let query = { organizationId: req.params.organizationId };

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        query.date.$lte = endOfDay;
      }
    }

    if (transactionType) {
      query.transactionType = transactionType;
    }

    if (expenseProjectId) {
      query.expenseProjectId = expenseProjectId;
    }

    const transactions = await Transaction.find(query)
      .populate('createdBy', 'email')
      .populate('expenseProjectId', 'name')
      .sort({ date: -1 });

    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single transaction
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, organizationId: req.params.organizationId })
      .populate('createdBy', 'email')
      .populate('auditLogs.userId', 'email');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create transaction
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { date, description, subDescription, transactionType, amount, balance, includeHST, includeGST, comments, expenseProjectId } = req.body;

    const transaction = await Transaction.create({
      date,
      description,
      subDescription,
      transactionType,
      amount,
      balance,
      includeHST,
      includeGST,
      comments,
      expenseProjectId,
      organizationId: req.params.organizationId,
      createdBy: req.user._id
    });

    res.status(201).json({ transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk import transactions from CSV
router.post('/:organizationId/import', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { csvData, expenseProjectId } = req.body;

    if (!csvData) {
      return res.status(400).json({ message: 'CSV data is required' });
    }

    // Generate unique import batch ID
    const importBatchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const transactions = [];
    const stream = Readable.from([csvData]);

    stream
      .pipe(csvParser())
      .on('data', (row) => {
        // Skip filter row or empty rows
        if (row.Date && !row.Date.includes('Custom filters') && row.Date.trim() !== '') {
          const amount = parseFloat(row.Amount);
          transactions.push({
            organizationId: req.params.organizationId,
            expenseProjectId: expenseProjectId || null,
            importBatchId: importBatchId,
            date: new Date(row.Date),
            description: row.Description || '',
            subDescription: row['Sub-description'] || '',
            transactionType: row['Type of Transaction'] || (amount >= 0 ? 'Credit' : 'Debit'),
            amount: Math.abs(amount),
            balance: parseFloat(row.Balance) || 0,
            comments: row.Comments || '',
            createdBy: req.user._id
          });
        }
      })
      .on('end', async () => {
        try {
          const result = await Transaction.insertMany(transactions);
          res.status(201).json({
            message: 'Transactions imported successfully',
            count: result.length,
            importBatchId: importBatchId,
            transactions: result
          });
        } catch (error) {
          res.status(500).json({ message: 'Error saving transactions', error: error.message });
        }
      })
      .on('error', (error) => {
        res.status(500).json({ message: 'Error parsing CSV', error: error.message });
      });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update transaction
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, organizationId: req.params.organizationId });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Track changes in audit log
    const allowedFields = ['description', 'subDescription', 'amount', 'transactionType', 'includeHST', 'includeGST', 'comments', 'date', 'balance', 'expenseProjectId'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== transaction[field]) {
        transaction.auditLogs.push({
          userId: req.user._id,
          fieldChanged: field,
          previousValue: String(transaction[field] || ''),
          newValue: String(req.body[field] || '')
        });
        transaction[field] = req.body[field];
      }
    });

    await transaction.save();

    const updatedTransaction = await Transaction.findById(transaction._id)
      .populate('createdBy', 'email')
      .populate('auditLogs.userId', 'email');

    res.json({ transaction: updatedTransaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete import batch - MUST come before /:organizationId/:id
router.delete('/:organizationId/batch/:importBatchId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { importBatchId } = req.params;
    const result = await Transaction.deleteMany({
      organizationId: req.params.organizationId,
      importBatchId: importBatchId
    });

    res.json({
      message: 'Import batch deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete transaction
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, organizationId: req.params.organizationId });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Apply tax settings to existing transactions in a project
router.post('/:organizationId/apply-tax-settings', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { expenseProjectId, taxSettings } = req.body;

    if (!expenseProjectId || !taxSettings) {
      return res.status(400).json({ message: 'expenseProjectId and taxSettings are required' });
    }

    // Get all transactions for this project
    const transactions = await Transaction.find({
      organizationId: req.params.organizationId,
      expenseProjectId: expenseProjectId
    });

    let updatedCount = 0;

    for (const transaction of transactions) {
      const typeKey = transaction.transactionType.toLowerCase(); // 'debit' or 'credit'
      const typeSettings = taxSettings[typeKey];

      if (typeSettings) {
        // Only update if settings are different
        const newHST = typeSettings.hstEnabled || false;
        const newGST = typeSettings.gstEnabled || false;

        if (transaction.includeHST !== newHST || transaction.includeGST !== newGST) {
          // Add audit log BEFORE updating values so previousValue is correct
          transaction.auditLogs.push({
            userId: req.user._id,
            fieldChanged: 'taxSettings',
            previousValue: `HST: ${transaction.includeHST}, GST: ${transaction.includeGST}`,
            newValue: `HST: ${newHST}, GST: ${newGST}`
          });

          transaction.includeHST = newHST;
          transaction.includeGST = newGST;

          await transaction.save(); // This triggers the pre-save hook to recalculate tax amounts
          updatedCount++;
        }
      }
    }

    res.json({
      message: `Tax settings applied to ${updatedCount} transactions`,
      updatedCount,
      totalTransactions: transactions.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
