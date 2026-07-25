import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  targetType: { type: String, enum: ['all', 'departments', 'employees'], default: 'all' },
  targetDepartments: [{ type: String }],
  targetEmployees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
  isPinned: { type: Boolean, default: false },
  attachments: [{
    filename: String,
    fileData: String,
    fileType: String,
    fileSize: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  acknowledgments: [{
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date, default: Date.now }
  }],
  isActive: { type: Boolean, default: true },
  publishedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

announcementSchema.index({ organizationId: 1, isPinned: -1, publishedAt: -1 });
announcementSchema.index({ organizationId: 1, isActive: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);
export default Announcement;
