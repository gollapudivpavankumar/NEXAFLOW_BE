import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import { JWT_SECRET, PACKAGES } from '../config/env.js';

// Verify JWT token
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (req.user.isActive === false) {
        return res.status(403).json({ message: 'This account has been deactivated' });
      }

      return next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token' });
};

// Check if user is superadmin
export const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Super admin only.' });
  }
};

// Check if user is orgadmin or superadmin
export const orgAdminOrSuperAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'orgadmin' || req.user.role === 'superadmin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin access required.' });
  }
};

// Check if user belongs to the organization
export const checkOrganizationAccess = (req, res, next) => {
  const orgId = req.params.organizationId || req.params.orgId || req.body.organizationId;

  // Validate orgId is present
  if (!orgId) {
    return res.status(400).json({ message: 'Organization ID is required' });
  }

  // Super admin has access to all organizations
  if (req.user.role === 'superadmin') {
    return next();
  }

  // Ensure user has an organizationId before calling .toString()
  if (!req.user.organizationId) {
    return res.status(403).json({ message: 'Access denied to this organization' });
  }

  // Org admin and employees can only access their own organization
  if ((req.user.role === 'orgadmin' || req.user.role === 'employee') &&
      req.user.organizationId.toString() === orgId) {
    return next();
  }

  res.status(403).json({ message: 'Access denied to this organization' });
};

// Check if user is employee only
export const employeeOnly = (req, res, next) => {
  if (req.user && req.user.role === 'employee') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Employee access required.' });
  }
};

// Check if user is employee or orgadmin
export const employeeOrOrgAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'employee' || req.user.role === 'orgadmin' || req.user.role === 'superadmin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Employee or admin access required.' });
  }
};

// Check if employee is accessing their own data
export const checkEmployeeSelfAccess = (req, res, next) => {
  const employeeId = req.params.employeeId || req.body.employeeId;

  // Super admin and org admin have access to all employees
  if (req.user.role === 'superadmin' || req.user.role === 'orgadmin') {
    return next();
  }

  // Employees can only access their own data
  if (req.user.role === 'employee' && req.user.employeeId && req.user.employeeId.toString() === employeeId) {
    return next();
  }

  res.status(403).json({ message: 'Access denied. You can only access your own data.' });
};

/**
 * Assert the organization on the request holds the named package.
 *
 * This is the org-level entitlement gate — "did this tenant buy the product".
 * It is deliberately separate from requireModule, which answers "did the admin
 * give this particular person access". Superadmins bypass it so support staff
 * can inspect any tenant.
 */
export const requirePackage = (packageName) => async (req, res, next) => {
  try {
    if (req.user?.role === 'superadmin') {
      return next();
    }

    const orgId = req.params.organizationId || req.params.orgId || req.user?.organizationId;
    if (!orgId) {
      return res.status(400).json({ message: 'Organization ID is required' });
    }

    const organization = await Organization.findById(orgId).select('packages isActive');
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const packages = organization.packages?.length ? organization.packages : ['hrm'];
    if (!packages.includes(packageName)) {
      return res.status(403).json({
        message: 'Your organization does not have access to this product.',
        missingPackage: packageName
      });
    }

    req.organization = organization;
    return next();
  } catch (error) {
    console.error('Package check error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Assert the signed-in user was granted the named module by their org admin.
 * Runs after requirePackage — an org that never bought the product fails first,
 * with a message that tells the admin what to buy rather than what to grant.
 */
export const requireModule = (packageName) => (req, res, next) => {
  if (req.user?.role === 'superadmin' || req.user?.role === 'orgadmin') {
    return next();
  }

  if (req.user?.hasModule?.(packageName)) {
    return next();
  }

  return res.status(403).json({
    message: 'You do not have access to this module. Ask your administrator to enable it.',
    missingModule: packageName
  });
};

/** Convenience pairing for the Jira Dashboard, which always needs both gates. */
export const requireTaskHub = [
  requirePackage(PACKAGES.TASKHUB),
  requireModule(PACKAGES.TASKHUB)
];
