import mongoose from 'mongoose';

const emailAccountSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  emailAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  domain: {
    type: String,
    required: true
  },
  quota: {
    type: Number,
    default: 1024
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  webmailUrl: {
    type: String
  },
  // AES-encrypted mailbox password, used ONLY to auto-connect the in-ERP
  // webmail client for this account's owner. Never returned to the client.
  secret: {
    type: String,
    select: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

emailAccountSchema.index({ organizationId: 1, emailAddress: 1 }, { unique: true });

const EmailAccount = mongoose.model('EmailAccount', emailAccountSchema);
export default EmailAccount;
