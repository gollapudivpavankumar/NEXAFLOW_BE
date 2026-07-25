import express from 'express';
import SubscriptionRequest from '../models/SubscriptionRequest.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import { protect, superAdminOnly } from '../middleware/auth.js';

const router = express.Router();

// Subscription Plans with pricing
const SUBSCRIPTION_PLANS = {
  starter: {
    name: 'Starter',
    monthlyPrice: 49,
    quarterlyPrice: 129, // ~12% discount
    yearlyPrice: 469,    // ~20% discount
    features: ['Up to 10 employees', 'Basic payroll', 'Email support', 'Payslip generation']
  },
  professional: {
    name: 'Professional',
    monthlyPrice: 99,
    quarterlyPrice: 269,
    yearlyPrice: 949,
    features: ['Up to 50 employees', 'Full payroll suite', 'Leave management', 'Attendance tracking', 'Priority support']
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 199,
    quarterlyPrice: 539,
    yearlyPrice: 1899,
    features: ['Unlimited employees', 'All features', 'Custom integrations', 'Dedicated support', 'API access']
  }
};

// E-Transfer payment info (for display to users)
const ETRANSFER_INFO = {
  recipientEmail: 'payments@sparklextechnologies.com',
  recipientName: 'Sparklex Technologies Inc.',
  message: 'Please include your organization name and email in the e-transfer message'
};

// @route   GET /api/subscriptions/plans
// @desc    Get available subscription plans
// @access  Public
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: SUBSCRIPTION_PLANS,
    eTransferInfo: ETRANSFER_INFO
  });
});

// @route   POST /api/subscriptions/request
// @desc    Create a new subscription request (public - no auth required)
// @access  Public
router.post('/request', async (req, res) => {
  try {
    const {
      organizationName,
      email,
      phone,
      contactName,
      addressLine1,
      addressLine2,
      city,
      province,
      postalCode,
      country,
      planType,
      planDuration,
      employeeCount,
      eTransferReference,
      eTransferSenderName,
      eTransferSenderEmail,
      eTransferAmount,
      eTransferDate,
      paymentNotes
    } = req.body;

    // Validate required fields
    if (!organizationName || !email || !phone || !contactName) {
      return res.status(400).json({
        success: false,
        message: 'Organization name, email, phone, and contact name are required'
      });
    }

    // Check if email is already registered
    const existingOrg = await Organization.findOne({ email: email.toLowerCase() });
    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message: 'An organization with this email already exists. Please login or use a different email.'
      });
    }

    // Check for pending request with same email
    const existingRequest = await SubscriptionRequest.findOne({
      email: email.toLowerCase(),
      status: { $in: ['pending', 'payment_received', 'verified'] }
    });
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A subscription request with this email is already pending. Please wait for admin approval or contact support.'
      });
    }

    // Calculate expected amount based on plan
    const plan = SUBSCRIPTION_PLANS[planType || 'starter'];
    let expectedAmount = plan.monthlyPrice;
    if (planDuration === 'quarterly') expectedAmount = plan.quarterlyPrice;
    if (planDuration === 'yearly') expectedAmount = plan.yearlyPrice;

    // Create subscription request
    const subscriptionRequest = await SubscriptionRequest.create({
      organizationName,
      email: email.toLowerCase(),
      phone,
      contactName,
      addressLine1: addressLine1 || '',
      addressLine2: addressLine2 || '',
      city: city || '',
      province: province || '',
      postalCode: postalCode || '',
      country: country || 'Canada',
      planType: planType || 'starter',
      planDuration: planDuration || 'monthly',
      employeeCount: employeeCount || '1-10',
      eTransferReference: eTransferReference || '',
      eTransferSenderName: eTransferSenderName || '',
      eTransferSenderEmail: eTransferSenderEmail || '',
      eTransferAmount: eTransferAmount || expectedAmount,
      eTransferDate: eTransferDate ? new Date(eTransferDate) : null,
      paymentNotes: paymentNotes || '',
      status: eTransferReference ? 'payment_received' : 'pending'
    });

    res.status(201).json({
      success: true,
      message: eTransferReference
        ? 'Subscription request submitted successfully. We will verify your payment and activate your account within 24-48 hours.'
        : 'Subscription request submitted successfully. Please complete the e-transfer payment to the provided email address.',
      request: {
        id: subscriptionRequest._id,
        organizationName: subscriptionRequest.organizationName,
        email: subscriptionRequest.email,
        planType: subscriptionRequest.planType,
        planDuration: subscriptionRequest.planDuration,
        status: subscriptionRequest.status,
        expectedAmount: expectedAmount
      },
      eTransferInfo: ETRANSFER_INFO
    });

  } catch (error) {
    console.error('Subscription request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit subscription request',
      error: error.message
    });
  }
});

// @route   GET /api/subscriptions/request/:email
// @desc    Check subscription request status by email (public)
// @access  Public
router.get('/request/status/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const request = await SubscriptionRequest.findOne({
      email: email.toLowerCase()
    }).sort({ createdAt: -1 });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'No subscription request found with this email'
      });
    }

    res.json({
      success: true,
      request: {
        id: request._id,
        organizationName: request.organizationName,
        email: request.email,
        planType: request.planType,
        planDuration: request.planDuration,
        status: request.status,
        createdAt: request.createdAt,
        processedAt: request.processedAt
      }
    });

  } catch (error) {
    console.error('Check request status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check request status'
    });
  }
});

// @route   PUT /api/subscriptions/request/:email/payment
// @desc    Update payment details for a subscription request
// @access  Public
router.put('/request/:email/payment', async (req, res) => {
  try {
    const { email } = req.params;
    const {
      eTransferReference,
      eTransferSenderName,
      eTransferSenderEmail,
      eTransferAmount,
      eTransferDate,
      paymentNotes
    } = req.body;

    const request = await SubscriptionRequest.findOne({
      email: email.toLowerCase(),
      status: 'pending'
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'No pending subscription request found with this email'
      });
    }

    // Update payment details
    request.eTransferReference = eTransferReference || request.eTransferReference;
    request.eTransferSenderName = eTransferSenderName || request.eTransferSenderName;
    request.eTransferSenderEmail = eTransferSenderEmail || request.eTransferSenderEmail;
    request.eTransferAmount = eTransferAmount || request.eTransferAmount;
    request.eTransferDate = eTransferDate ? new Date(eTransferDate) : request.eTransferDate;
    request.paymentNotes = paymentNotes || request.paymentNotes;
    request.status = 'payment_received';

    await request.save();

    res.json({
      success: true,
      message: 'Payment details updated. We will verify your payment and activate your account within 24-48 hours.',
      request: {
        id: request._id,
        status: request.status
      }
    });

  } catch (error) {
    console.error('Update payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment details'
    });
  }
});

// ==================== SUPERADMIN ROUTES ====================

// @route   GET /api/subscriptions/admin/requests
// @desc    Get all subscription requests (SuperAdmin only)
// @access  SuperAdmin
router.get('/admin/requests', protect, superAdminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const total = await SubscriptionRequest.countDocuments(query);
    const requests = await SubscriptionRequest.find(query)
      .populate('processedBy', 'email')
      .populate('organizationId', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      requests,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get subscription requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription requests'
    });
  }
});

// @route   GET /api/subscriptions/admin/requests/:id
// @desc    Get single subscription request details
// @access  SuperAdmin
router.get('/admin/requests/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const request = await SubscriptionRequest.findById(req.params.id)
      .populate('processedBy', 'email name')
      .populate('organizationId', 'name email');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Subscription request not found'
      });
    }

    res.json({
      success: true,
      request
    });

  } catch (error) {
    console.error('Get subscription request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription request'
    });
  }
});

// @route   PUT /api/subscriptions/admin/requests/:id/verify
// @desc    Verify payment for a subscription request
// @access  SuperAdmin
router.put('/admin/requests/:id/verify', protect, superAdminOnly, async (req, res) => {
  try {
    const { adminNotes } = req.body;

    const request = await SubscriptionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Subscription request not found'
      });
    }

    if (request.status !== 'payment_received') {
      return res.status(400).json({
        success: false,
        message: 'Can only verify requests with payment_received status'
      });
    }

    request.status = 'verified';
    request.adminNotes = adminNotes || request.adminNotes;
    await request.save();

    res.json({
      success: true,
      message: 'Payment verified successfully',
      request
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment'
    });
  }
});

// @route   PUT /api/subscriptions/admin/requests/:id/approve
// @desc    Approve subscription and create organization
// @access  SuperAdmin
router.put('/admin/requests/:id/approve', protect, superAdminOnly, async (req, res) => {
  try {
    const { adminNotes, tempPassword } = req.body;

    const request = await SubscriptionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Subscription request not found'
      });
    }

    if (!['payment_received', 'verified'].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: 'Can only approve requests with payment_received or verified status'
      });
    }

    // Check if organization already exists
    const existingOrg = await Organization.findOne({ email: request.email });
    if (existingOrg) {
      return res.status(400).json({
        success: false,
        message: 'Organization with this email already exists'
      });
    }

    // Calculate subscription dates
    const startDate = new Date();
    let endDate = new Date();
    switch (request.planDuration) {
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    // Create organization
    const organization = await Organization.create({
      name: request.organizationName,
      email: request.email,
      phone: request.phone,
      addressLine1: request.addressLine1,
      addressLine2: `${request.city}, ${request.province} ${request.postalCode}`,
      isActive: true,
      // Subscription info
      subscriptionStatus: 'active',
      subscriptionPlan: request.planType,
      subscriptionDuration: request.planDuration,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      employeeLimit: getEmployeeLimit(request.planType)
    });

    // Create org admin user
    // Generate a secure password - the User model pre-save hook will hash it
    const password = tempPassword || `${request.organizationName.replace(/\s/g, '')}@2024!`;

    const adminUser = await User.create({
      email: request.email,
      password: password, // Plain password - will be hashed by User model pre-save hook
      role: 'orgadmin',
      organizationId: organization._id
    });

    // Update subscription request
    request.status = 'approved';
    request.organizationId = organization._id;
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    request.adminNotes = adminNotes || request.adminNotes;
    request.subscriptionStartDate = startDate;
    request.subscriptionEndDate = endDate;
    await request.save();

    res.json({
      success: true,
      message: 'Subscription approved and organization created successfully',
      organization: {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        subscriptionEndDate: endDate
      },
      credentials: {
        email: request.email,
        tempPassword: password,
        note: 'Please share these credentials securely with the customer'
      }
    });

  } catch (error) {
    console.error('Approve subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve subscription',
      error: error.message
    });
  }
});

// @route   PUT /api/subscriptions/admin/requests/:id/reject
// @desc    Reject subscription request
// @access  SuperAdmin
router.put('/admin/requests/:id/reject', protect, superAdminOnly, async (req, res) => {
  try {
    const { adminNotes, reason } = req.body;

    const request = await SubscriptionRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Subscription request not found'
      });
    }

    if (request.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject an already approved request'
      });
    }

    request.status = 'rejected';
    request.adminNotes = adminNotes || reason || 'Request rejected by admin';
    request.processedBy = req.user._id;
    request.processedAt = new Date();
    await request.save();

    res.json({
      success: true,
      message: 'Subscription request rejected',
      request
    });

  } catch (error) {
    console.error('Reject subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject subscription'
    });
  }
});

// @route   GET /api/subscriptions/admin/stats
// @desc    Get subscription statistics
// @access  SuperAdmin
router.get('/admin/stats', protect, superAdminOnly, async (req, res) => {
  try {
    const stats = await SubscriptionRequest.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$eTransferAmount' }
        }
      }
    ]);

    const totalRequests = await SubscriptionRequest.countDocuments();
    const pendingRequests = await SubscriptionRequest.countDocuments({
      status: { $in: ['pending', 'payment_received'] }
    });
    const approvedRequests = await SubscriptionRequest.countDocuments({ status: 'approved' });

    // Get recent requests
    const recentRequests = await SubscriptionRequest.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('organizationName email planType status createdAt');

    res.json({
      success: true,
      stats: {
        byStatus: stats,
        total: totalRequests,
        pending: pendingRequests,
        approved: approvedRequests
      },
      recentRequests
    });

  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription stats'
    });
  }
});

// Helper function to get employee limit based on plan
function getEmployeeLimit(planType) {
  switch (planType) {
    case 'starter': return 10;
    case 'professional': return 50;
    case 'enterprise': return 9999; // Unlimited
    default: return 10;
  }
}

export default router;
