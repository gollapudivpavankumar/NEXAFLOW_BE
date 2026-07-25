import express from 'express';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Employee from '../models/Employee.js';
import generateToken from '../utils/generateToken.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Get organization details if user is orgadmin or employee
    let organization = null;
    if ((user.role === 'orgadmin' || user.role === 'employee') && user.organizationId) {
      organization = await Organization.findById(user.organizationId);

      // Check subscription status for non-superadmin users
      if (organization) {
        // Check if organization is active
        if (!organization.isActive) {
          return res.status(403).json({
            message: 'Your organization account has been deactivated. Please contact support.'
          });
        }

        // Check subscription status
        if (organization.subscriptionStatus === 'suspended') {
          return res.status(403).json({
            message: 'Your subscription has been suspended. Please contact support to reactivate.'
          });
        }

        if (organization.subscriptionStatus === 'cancelled') {
          return res.status(403).json({
            message: 'Your subscription has been cancelled. Please renew your subscription to continue.'
          });
        }

        // Check if subscription is expired (for non-legacy plans)
        if (organization.subscriptionPlan !== 'legacy' &&
            organization.subscriptionEndDate &&
            new Date(organization.subscriptionEndDate) < new Date()) {
          // Update status to expired
          organization.subscriptionStatus = 'expired';
          await organization.save();

          return res.status(403).json({
            message: 'Your subscription has expired. Please renew your subscription to continue.',
            subscriptionExpired: true
          });
        }
      }
    }

    // Get employee details if user is employee
    let employee = null;
    if (user.role === 'employee' && user.employeeId) {
      employee = await Employee.findById(user.employeeId);
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        employeeId: user.employeeId,
        organization: organization ? {
          id: organization._id,
          name: organization.name,
          email: organization.email,
          phone: organization.phone,
          logo: organization.logo,
          themeColor: organization.themeColor,
          subscriptionStatus: organization.subscriptionStatus,
          subscriptionPlan: organization.subscriptionPlan,
          subscriptionEndDate: organization.subscriptionEndDate
        } : null,
        employee: employee ? {
          id: employee._id,
          name: employee.name,
          email: employee.email
        } : null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    let organization = null;
    if ((user.role === 'orgadmin' || user.role === 'employee') && user.organizationId) {
      organization = await Organization.findById(user.organizationId);
    }

    let employee = null;
    if (user.role === 'employee' && user.employeeId) {
      employee = await Employee.findById(user.employeeId);
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        employeeId: user.employeeId,
        organization: organization ? {
          id: organization._id,
          name: organization.name,
          email: organization.email,
          phone: organization.phone,
          logo: organization.logo,
          themeColor: organization.themeColor,
          subscriptionStatus: organization.subscriptionStatus,
          subscriptionPlan: organization.subscriptionPlan,
          subscriptionEndDate: organization.subscriptionEndDate
        } : null,
        employee: employee ? {
          id: employee._id,
          name: employee.name,
          email: employee.email
        } : null
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
