import mongoose from 'mongoose';

const manualPayslipEmployeeSchema = new mongoose.Schema({
  companyProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyProfile',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  employeeName: {
    type: String,
    required: true
  },
  employeeEmail: {
    type: String
  },
  employeeAddress: {
    type: String
  },
  employeePosition: {
    type: String
  },
  province: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
manualPayslipEmployeeSchema.index({ companyProfileId: 1, employeeName: 1 });
manualPayslipEmployeeSchema.index({ organizationId: 1 });

const ManualPayslipEmployee = mongoose.model('ManualPayslipEmployee', manualPayslipEmployeeSchema);

export default ManualPayslipEmployee;
