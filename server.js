import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import { initializeMonthlyPaymentScheduler } from './services/monthlyPaymentGenerator.js';

// Import routes
import authRoutes from './routes/auth.js';
import organizationRoutes from './routes/organizations.js';
import employeeRoutes from './routes/employees.js';
import employeeWithLoginRoutes from './routes/employeeWithLogin.js';
import paymentRoutes from './routes/payments.js';
import payslipRoutes from './routes/payslips.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leave.js';
import chatRoutes from './routes/chat.js';
import templateRoutes from './routes/templates.js';
import payslipRequestRoutes from './routes/payslipRequests.js';
import offerLetterTemplateRoutes from './routes/offerLetterTemplates.js';
import offerLetterRoutes from './routes/offerLetters.js';
import jobRoutes from './routes/jobs.js';
import jobApplicationRoutes from './routes/jobApplications.js';
import taxCalculatorRoutes from './routes/taxCalculator.js';
import employeeDocumentRoutes from './routes/employeeDocuments.js';
import assetRoutes from './routes/assets.js';
import policyRoutes from './routes/policies.js';
import courseRoutes from './routes/courses.js';
import supportRoutes from './routes/support.js';
import attendanceRegularizationRoutes from './routes/attendanceRegularization.js';
import transactionRoutes from './routes/transactions.js';
import expenseProjectRoutes from './routes/expenseProjects.js';
import companyProfileRoutes from './routes/companyProfiles.js';
import manualPayslipEmployeeRoutes from './routes/manualPayslipEmployees.js';
import subscriptionRoutes from './routes/subscriptions.js';
import announcementRoutes from './routes/announcements.js';
import loanRoutes from './routes/loans.js';
import shiftRoutes from './routes/shifts.js';
import offboardingRoutes from './routes/offboarding.js';
import bankFileRoutes from './routes/bankFiles.js';
import emailAccountRoutes from './routes/emailAccounts.js';
import calendarRoutes from './routes/calendar.js';
import learningPathRoutes from './routes/learningPaths.js';
import meetingRoutes from './routes/meetings.js';
import webmailRoutes from './routes/webmail.js';

// Socket.IO and HTTP
import { createServer } from 'http';
import { initializeSocketService } from './services/socketService.js';
import { initializeCalendarReminders } from './services/calendarReminderService.js';

// Resilience: never let a single stray async error (e.g. a mail socket
// timeout) crash the whole server. Log and keep running.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (kept alive):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (kept alive):', err?.message || err);
});

// Connect to MongoDB
connectDB();

// Initialize express app
const app = express();
const server = createServer(app);

// Initialize Socket.IO
const io = initializeSocketService(server);

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/employees', employeeWithLoginRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payslips', payslipRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/payslip-requests', payslipRequestRoutes);
app.use('/api/offer-letter-templates', offerLetterTemplateRoutes);
app.use('/api/offer-letters', offerLetterRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/job-applications', jobApplicationRoutes);
app.use('/api/tax-calculator', taxCalculatorRoutes);
app.use('/api/employee-documents', employeeDocumentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/attendance-regularization', attendanceRegularizationRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/expense-projects', expenseProjectRoutes);
app.use('/api/company-profiles', companyProfileRoutes);
app.use('/api/manual-payslip-employees', manualPayslipEmployeeRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/offboarding', offboardingRoutes);
app.use('/api/bank-files', bankFileRoutes);
app.use('/api/email-accounts', emailAccountRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/learning-paths', learningPathRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/webmail', webmailRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Payroll SaaS API is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Payroll SaaS API',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: err.stack
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Initialize monthly payment generation scheduler
console.log('\n📅 Setting up automatic payment generation...');
try {
  initializeMonthlyPaymentScheduler();
  console.log('✓ Monthly payment scheduler is active\n');
} catch (error) {
  console.error('Failed to initialize payment scheduler:', error);
}

// Start calendar reminder service
try {
  initializeCalendarReminders();
  console.log('✓ Calendar reminder service started\n');
} catch (error) {
  console.error('Failed to start calendar reminders:', error);
}

// Start server
const PORT = 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Socket.IO enabled for real-time chat');
});

export { io };
export default app;
