import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  // Personal Information (Step 1 - ADP WFN style)
  firstName: {
    type: String,
    trim: true,
    default: ''
  },
  middleName: {
    type: String,
    trim: true,
    default: ''
  },
  lastName: {
    type: String,
    trim: true,
    default: ''
  },
  name: {
    type: String,
    required: [true, 'Employee name is required'],
    trim: true
  },
  preferredName: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false  // Optional - only if employee has login access
  },
  // Address
  addressLine1: {
    type: String,
    trim: true,
    default: ''
  },
  addressLine2: {
    type: String,
    trim: true,
    default: ''
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  postalCode: {
    type: String,
    trim: true,
    default: ''
  },
  // Demographics
  birthDate: {
    type: Date
  },
  preferredLanguage: {
    type: String,
    enum: ['English', 'French'],
    default: 'English'
  },
  // Social Insurance
  sin: {
    type: String,
    trim: true,
    default: ''
  },
  sinNotProvided: {
    type: Boolean,
    default: false
  },
  // Employment Information (Step 2 - ADP WFN style)
  fileNumber: {
    type: String,
    trim: true,
    default: ''
  },
  position: {
    type: String,
    trim: true,
    default: ''
  },
  jobTitle: {
    type: String,
    trim: true,
    default: ''
  },
  department: {
    type: String,
    trim: true,
    default: ''
  },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  province: {
    type: String,
    trim: true,
    required: [true, 'Province is required for tax calculations'],
    enum: [
      'Alberta',
      'British Columbia',
      'Manitoba',
      'New Brunswick',
      'Newfoundland and Labrador',
      'Nova Scotia',
      'Ontario',
      'Prince Edward Island',
      'Quebec',
      'Saskatchewan',
      'Northwest Territories',
      'Nunavut',
      'Yukon'
    ]
  },
  joiningDate: {
    type: Date,
    required: [true, 'Joining date is required']
  },
  selfServiceAccess: {
    type: Boolean,
    default: false
  },
  // Pay Information (Step 3 - ADP WFN style)
  compensationType: {
    type: String,
    enum: ['salaried', 'hourly', 'contractor', 'self-employed-commission'],
    default: 'salaried'
  },
  // Pay Period Frequency - matches CRA options
  payPeriodFrequency: {
    type: String,
    enum: [
      'DAILY',           // Daily (240 pay periods a year)
      'WEEKLY_52PP',     // Weekly (52 pay periods a year)
      'BI_WEEKLY',       // Biweekly (26 pay periods a year)
      'SEMI_MONTHLY',    // Semi-monthly (24 pay periods a year)
      'MONTHLY_12PP',    // Monthly (12 pay periods a year)
      'TEN_10PP',        // (10 pay periods a year)
      'THIRTEEN_13PP',   // (13 pay periods a year)
      'TWENTYTWO_22PP',  // (22 pay periods a year)
      'WEEKLY_53PP',     // Weekly (53 pay periods a year)
      'BI_WEEKLY_27PP'   // Biweekly (27 pay periods a year)
    ],
    default: 'MONTHLY_12PP'
  },
  // Timesheets (for hourly workers)
  useTimesheets: {
    type: Boolean,
    default: false
  },
  calculateOvertimeAuto: {
    type: Boolean,
    default: false
  },
  calculateHolidayPayAuto: {
    type: Boolean,
    default: false
  },
  timeZone: {
    type: String,
    default: 'EST - Eastern Standard Time'
  },
  badgeNumber: {
    type: String,
    trim: true,
    default: ''
  },
  // Regular Pay
  salaryPerPay: {
    type: Number,
    min: 0,
    default: 0
  },
  standardHoursPerPay: {
    type: Number,
    min: 0,
    default: 0
  },
  baseRatePerHour: {
    type: Number,
    min: 0,
    default: 0
  },
  annualSalary: {
    type: Number,
    min: 0,
    default: 0
  },
  // Direct Deposit / Bank Info
  bankAccountNumber: {
    type: String,
    trim: true,
    default: ''
  },
  bankTransit: {
    type: String,
    trim: true,
    default: ''
  },
  financialInstitution: {
    type: String,
    trim: true,
    default: ''
  },
  // WSIB (Ontario specific)
  wsibContribute: {
    type: Boolean,
    default: false
  },
  // Tax Reporting
  dentalBenefitsCoverageCode: {
    type: String,
    trim: true,
    default: ''
  },
  // Contractor specific fields
  isIncorporated: {
    type: Boolean,
    default: false
  },
  createT4A: {
    type: Boolean,
    default: true
  },
  // Self-Employed Commission specific
  recipientProgramAccountNumber: {
    type: String,
    trim: true,
    default: ''
  },
  recipientProgramAccountNotProvided: {
    type: Boolean,
    default: false
  },
  // Vacation
  vacationAccrualRate: {
    type: Number,
    min: 0,
    default: 4  // Standard 4% in most provinces
  },
  vacationPayMethod: {
    type: String,
    enum: ['payout_every_pay_period', 'accrue_time_off', 'track_outside_payroll'],
    default: 'payout_every_pay_period'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  },
  // Current salary details (editable by admins)
  currentSalary: {
    type: {
      gross: {
        type: Number,
        required: true,
        min: 0
      },
      net: {
        type: Number,
        required: true,
        min: 0
      },
      federalTax: {
        type: Number,
        default: 0,
        min: 0
      },
      provincialTax: {
        type: Number,
        default: 0,
        min: 0
      },
      totalTax: {
        type: Number,
        default: 0,
        min: 0
      },
      cpp: {
        type: Number,
        default: 0,
        min: 0
      },
      cpp2: {
        type: Number,
        default: 0,
        min: 0
      },
      ei: {
        type: Number,
        default: 0,
        min: 0
      },
      employerCpp: {
        type: Number,
        min: 0,
        default: 0
      },
      employerEi: {
        type: Number,
        min: 0,
        default: 0
      },
      remittance: {
        type: Number,
        min: 0,
        default: 0
      },
      effectiveDate: {
        type: Date,
        default: Date.now
      },
      calculatedBy: {
        type: String,
        enum: ['manual', 'calculator'],
        default: 'calculator'
      }
    },
    required: false  // Not required - can be set later
  },
  reportingManagerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  // Salary history - track all salary changes
  salaryHistory: [{
    gross: {
      type: Number,
      required: true
    },
    net: {
      type: Number,
      required: true
    },
    federalTax: {
      type: Number,
      required: true
    },
    provincialTax: {
      type: Number,
      required: true
    },
    totalTax: {
      type: Number,
      required: true
    },
    cpp: {
      type: Number,
      required: true
    },
    cpp2: {
      type: Number,
      default: 0
    },
    ei: {
      type: Number,
      required: true
    },
    employerCpp: {
      type: Number,
      default: 0
    },
    employerEi: {
      type: Number,
      default: 0
    },
    remittance: {
      type: Number,
      default: 0
    },
    effectiveDate: {
      type: Date,
      required: true
    },
    calculatedBy: {
      type: String,
      enum: ['manual', 'calculator'],
      default: 'calculator'
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: {
      type: String,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for faster lookups
employeeSchema.index({ organizationId: 1, name: 1 });
employeeSchema.index({ organizationId: 1, email: 1 }, { sparse: true });
employeeSchema.index({ userId: 1 }, { sparse: true });
employeeSchema.index({ organizationId: 1, isActive: 1 });

const Employee = mongoose.model('Employee', employeeSchema);

export default Employee;
