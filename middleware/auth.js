import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verify JWT token
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, 'your-super-secret-jwt-key-change-this-in-production');

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
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
