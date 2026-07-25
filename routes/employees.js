import express from 'express';
import Employee from '../models/Employee.js';
import { protect, checkOrganizationAccess, orgAdminOrSuperAdmin } from '../middleware/auth.js';
import CRAPayrollScraper from '../services/taxCalculator.js';

const router = express.Router();

/**
 * Helper function to calculate taxes using JavaScript Selenium scraper
 */
async function calculateTaxes(grossSalary, province, paymentDate = null) {
  try {
    const date = paymentDate || new Date();
    const paymentDateObj = {
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString().padStart(2, '0'),
      day: date.getDate().toString().padStart(2, '0')
    };

    console.log('Calculating taxes with JavaScript scraper:', { grossSalary, province, paymentDateObj });

    const scraper = new CRAPayrollScraper();
    const results = await scraper.calculate(grossSalary, province, paymentDateObj);

    const parseValue = (str) => {
      if (!str) return 0;
      return parseFloat(str.toString().replace(/[CA$,\s]/g, '')) || 0;
    };

    return {
      gross: grossSalary,
      net: parseValue(results.totals?.net_amount),
      federalTax: parseValue(results.tax_deductions?.federal_tax),
      provincialTax: parseValue(results.tax_deductions?.provincial_tax),
      totalTax: parseValue(results.tax_deductions?.total_tax),
      cpp: parseValue(results.other_deductions?.cpp),
      cpp2: parseValue(results.other_deductions?.cpp2),
      ei: parseValue(results.other_deductions?.ei),
      employerCpp: 0,
      employerEi: 0,
      remittance: parseValue(results.totals?.total_deductions),
      effectiveDate: date,
      calculatedBy: 'calculator'
    };
  } catch (error) {
    console.error('Tax calculation error:', error);
    throw new Error('Failed to calculate taxes: ' + error.message);
  }
}

// @route   GET /api/employees/:organizationId
// @desc    Get all employees for an organization
// @access  Private
router.get('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const employees = await Employee.find({ organizationId })
      .sort({ name: 1 });

    res.json({ employees });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/employees/:organizationId
// @desc    Create new employee with auto tax calculation
// @access  Private
router.post('/:organizationId', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const {
      name,
      email,
      province,
      joiningDate,
      position,
      location,
      bankAccountNumber,
      bankTransit,
      notes,
      grossSalary,
      useCalculator = true,  // Flag to use tax calculator
      currentSalary // Optional manual salary data
    } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Please provide a valid employee name' });
    }
    if (!province) {
      return res.status(400).json({ message: 'Please provide province for tax calculations' });
    }
    if (!joiningDate) {
      return res.status(400).json({ message: 'Please provide joining date' });
    }
    if (!grossSalary && !currentSalary) {
      return res.status(400).json({ message: 'Please provide gross salary or salary details' });
    }

    // Check for duplicate email within organization (if email provided)
    if (email && email.trim() !== '') {
      const existingEmployee = await Employee.findOne({
        organizationId,
        email: email.trim().toLowerCase(),
        isActive: true
      });
      if (existingEmployee) {
        return res.status(400).json({
          message: 'An active employee with this email already exists in your organization'
        });
      }
    }

    let salaryData;

    // Calculate taxes if requested and gross salary provided
    if (useCalculator && grossSalary) {
      try {
        console.log('Calculating taxes for employee:', { grossSalary, province });
        salaryData = await calculateTaxes(grossSalary, province, new Date(joiningDate));
        console.log('Tax calculation successful:', salaryData);
      } catch (calcError) {
        console.error('Tax calculation error:', calcError);
        // Fall back to manual entry if calculator fails
        return res.status(400).json({
          message: 'Tax calculation failed. Please provide salary details manually or try again.',
          error: calcError.message
        });
      }
    } else if (currentSalary) {
      // Use manually provided salary data
      salaryData = {
        ...currentSalary,
        calculatedBy: 'manual',
        effectiveDate: new Date(joiningDate)
      };
    } else {
      return res.status(400).json({ message: 'Please provide salary details' });
    }

    // Create employee
    const employee = await Employee.create({
      organizationId,
      name,
      email,
      province,
      joiningDate: new Date(joiningDate),
      position: position || '',
      location: location || '',
      bankAccountNumber: bankAccountNumber || '',
      bankTransit: bankTransit || '',
      notes: notes || '',
      currentSalary: salaryData,
      salaryHistory: [{
        ...salaryData,
        changedBy: req.user._id,
        notes: 'Initial salary upon joining'
      }]
    });

    res.status(201).json({
      message: 'Employee created successfully',
      employee
    });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/employees/:organizationId/:id
// @desc    Get single employee
// @access  Private
router.get('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const employee = await Employee.findOne({ _id: id, organizationId });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ employee });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/employees/:organizationId/:id
// @desc    Update employee
// @access  Private
router.put('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const employee = await Employee.findOne({ _id: id, organizationId });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const {
      name,
      email,
      province,
      joiningDate,
      position,
      location,
      bankAccountNumber,
      bankTransit,
      isActive,
      notes,
      currentSalary
    } = req.body;

    // Validate name if being updated
    if (name !== undefined && name.trim() === '') {
      return res.status(400).json({ message: 'Employee name cannot be empty' });
    }

    // Check for duplicate email within organization (if email is being updated)
    if (email !== undefined && email.trim() !== '') {
      const existingEmployee = await Employee.findOne({
        organizationId,
        email: email.trim().toLowerCase(),
        _id: { $ne: id },  // Exclude current employee
        isActive: true
      });
      if (existingEmployee) {
        return res.status(400).json({
          message: 'Another active employee with this email already exists in your organization'
        });
      }
    }

    // Update basic fields
    if (name) employee.name = name.trim();
    if (email !== undefined) employee.email = email;
    if (province) employee.province = province;
    if (joiningDate) employee.joiningDate = new Date(joiningDate);
    if (position !== undefined) employee.position = position;
    if (location !== undefined) employee.location = location;
    if (bankAccountNumber !== undefined) employee.bankAccountNumber = bankAccountNumber;
    if (bankTransit !== undefined) employee.bankTransit = bankTransit;
    if (typeof isActive !== 'undefined') employee.isActive = isActive;
    if (notes !== undefined) employee.notes = notes;

    // Update salary if provided
    if (currentSalary) {
      // Check if gross salary changed - if so, auto-recalculate taxes
      const grossChanged = currentSalary.gross && currentSalary.gross !== employee.currentSalary?.gross;

      if (grossChanged) {
        try {
          console.log(`Gross salary changed for ${employee.name}, recalculating taxes...`);
          // Auto-recalculate taxes with the new gross salary
          const recalculatedSalary = await calculateTaxes(
            currentSalary.gross,
            employee.province,
            currentSalary.effectiveDate ? new Date(currentSalary.effectiveDate) : new Date()
          );

          // Add to salary history with recalculated taxes
          employee.salaryHistory.push({
            ...recalculatedSalary,
            changedBy: req.user._id,
            notes: currentSalary.notes || 'Salary updated - taxes auto-calculated',
            effectiveDate: currentSalary.effectiveDate || new Date()
          });

          employee.currentSalary = {
            ...recalculatedSalary,
            effectiveDate: currentSalary.effectiveDate || new Date()
          };

          console.log(`✓ Taxes recalculated automatically for ${employee.name}`);
        } catch (calcError) {
          console.error('Auto tax calculation failed:', calcError.message);
          // Fall back to manual entry if auto-calc fails
          const salaryChanged =
            currentSalary.gross !== employee.currentSalary?.gross ||
            currentSalary.net !== employee.currentSalary?.net ||
            currentSalary.federalTax !== employee.currentSalary?.federalTax ||
            currentSalary.provincialTax !== employee.currentSalary?.provincialTax;

          if (salaryChanged) {
            employee.salaryHistory.push({
              ...currentSalary,
              changedBy: req.user._id,
              notes: currentSalary.notes || 'Salary updated (manual entry - auto-calc failed)',
              effectiveDate: currentSalary.effectiveDate || new Date()
            });
          }

          employee.currentSalary = {
            ...currentSalary,
            effectiveDate: currentSalary.effectiveDate || new Date()
          };
        }
      } else {
        // No gross change, just update as provided
        const salaryChanged =
          currentSalary.gross !== employee.currentSalary?.gross ||
          currentSalary.net !== employee.currentSalary?.net ||
          currentSalary.federalTax !== employee.currentSalary?.federalTax ||
          currentSalary.provincialTax !== employee.currentSalary?.provincialTax;

        if (salaryChanged) {
          employee.salaryHistory.push({
            ...currentSalary,
            changedBy: req.user._id,
            notes: currentSalary.notes || 'Salary updated',
            effectiveDate: currentSalary.effectiveDate || new Date()
          });
        }

        employee.currentSalary = {
          ...currentSalary,
          effectiveDate: currentSalary.effectiveDate || new Date()
        };
      }
    }

    await employee.save();

    res.json({
      message: 'Employee updated successfully',
      employee
    });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/employees/:organizationId/:id/calculate-salary
// @desc    Recalculate employee salary using tax calculator
// @access  Private
router.post('/:organizationId/:id/calculate-salary', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;
    const { grossSalary, effectiveDate, notes } = req.body;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const employee = await Employee.findOne({ _id: id, organizationId });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (!grossSalary) {
      return res.status(400).json({ message: 'Please provide gross salary' });
    }

    // Calculate taxes
    const salaryData = await calculateTaxes(
      grossSalary,
      employee.province,
      effectiveDate ? new Date(effectiveDate) : new Date()
    );

    // Add to history
    employee.salaryHistory.push({
      ...salaryData,
      changedBy: req.user._id,
      notes: notes || 'Salary recalculated using tax calculator'
    });

    // Update current salary
    employee.currentSalary = salaryData;

    await employee.save();

    res.json({
      message: 'Salary calculated and updated successfully',
      employee,
      calculatedSalary: salaryData
    });
  } catch (error) {
    console.error('Calculate salary error:', error);
    res.status(500).json({
      message: 'Failed to calculate salary',
      error: error.message
    });
  }
});

// @route   GET /api/employees/:organizationId/:id/salary-history
// @desc    Get employee salary history
// @access  Private
router.get('/:organizationId/:id/salary-history', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const employee = await Employee.findOne({ _id: id, organizationId })
      .populate('salaryHistory.changedBy', 'email role');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({
      salaryHistory: employee.salaryHistory.sort((a, b) => b.effectiveDate - a.effectiveDate)
    });
  } catch (error) {
    console.error('Get salary history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/employees/:organizationId/:id
// @desc    Delete employee
// @access  Private
router.delete('/:organizationId/:id', protect, checkOrganizationAccess, orgAdminOrSuperAdmin, async (req, res) => {
  try {
    const { organizationId, id } = req.params;

    // Check access
    if (req.user.role === 'orgadmin' && req.user.organizationId.toString() !== organizationId) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const employee = await Employee.findOne({ _id: id, organizationId });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    await Employee.findByIdAndDelete(id);

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
