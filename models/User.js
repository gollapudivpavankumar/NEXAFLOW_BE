import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { PACKAGES } from '../config/env.js';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  // Display name. Historically only Employee carried a name, which left org
  // admins nameless in chat, meetings and the Jira Dashboard. Kept in sync with
  // Employee.name when the user has an employee record; see
  // utils/userDirectory.js for the read-side fallback.
  name: {
    type: String,
    trim: true,
    default: ''
  },
  title: {
    type: String,
    trim: true,
    default: ''
  },
  avatarColor: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['superadmin', 'orgadmin', 'employee'],
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: function() {
      return this.role === 'orgadmin' || this.role === 'employee';
    }
  },
  // Optional even for employees: an organization that holds only the Jira
  // Dashboard package has no payroll data, so its users have no Employee
  // record. HRM routes still require one and check for it explicitly.
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: false
  },
  // Per-user grants for optional packages. The organization must also hold the
  // package (Organization.packages) for the grant to take effect.
  moduleAccess: {
    taskhub: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for faster lookups
userSchema.index({ organizationId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ organizationId: 1, 'moduleAccess.taskhub': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Role as the Jira Dashboard understands it. The dashboard only distinguishes
 * admins from members, so both superadmins and org admins map to `admin`.
 */
userSchema.virtual('hubRole').get(function() {
  return this.role === 'superadmin' || this.role === 'orgadmin' ? 'admin' : 'employee';
});

/** True when this user may open the Jira Dashboard, ignoring org entitlement. */
userSchema.methods.hasModule = function(packageName) {
  if (packageName === PACKAGES.TASKHUB) {
    return Boolean(this.moduleAccess?.taskhub);
  }
  return true;
};

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

export default User;
