# NEXAFLOW backend (`NEXAFLOW_BE`)

Located at `C:\Users\Kusuma\Projects\NEXAFLOW\NEXAFLOW_BE`. A companion frontend lives in `NEXAFLOW_FE` (Vite/React, runs on `:5173`). Backend runs on port **5000** (hardcoded in `server.js`).

## What it is
A **multi-tenant (organization-scoped) Canadian HR + payroll SaaS**. Core value: computing Canadian payroll deductions/remittances by scraping the CRA's official Payroll Deductions Online Calculator, plus a broad HR suite (employees, attendance, leave, shifts, recruitment, offer letters, learning/courses, assets, loans, offboarding, chat, webmail, calendar, meetings).

## Stack
- **Node.js ESM** (`"type": "module"`), **Express 4**, **Mongoose 8** on **MongoDB Atlas**.
- **Socket.IO** for real-time chat + WebRTC signaling.
- **Puppeteer** (CRA session token) + **axios** (CRA direct API) for tax scraping.
- **nodemailer** (SMTP), **imapflow** + **mailparser** (IMAP webmail), **@stream-io/node-sdk** (GetStream video), **node-cron** (schedulers), **multer** (uploads), **xlsx** / **csv-parser** (spreadsheets), **qrcode** (asset QR), **bcryptjs** + **jsonwebtoken** (auth).
- Scripts: `npm start` (node server.js), `npm run dev` (nodemon), plus seed scripts.

## Layout
`server.js` (entry, mounts ~39 routers under `/api/*`) · `config/` (db.js, cpanel.js) · `middleware/auth.js` · `models/` (**48** Mongoose models) · `routes/` (**39** routers) · `services/` (**10** services) · `utils/` · `uploads/` (served static). `new-scraper-test/` is the reverse-engineering sandbox that produced the hybrid scraper (docs + throwaway scripts).

## Auth & multi-tenancy
- JWT in `Authorization: Bearer`, **7-day** expiry. Login at `POST /api/auth/login`, current user `GET /api/auth/me`.
- **Three roles** (`models/User.js` enum): `superadmin`, `orgadmin`, `employee`. `organizationId` required for orgadmin/employee; `employeeId` required for employee.
- Middleware in `middleware/auth.js`: `protect`, `superAdminOnly`, `orgAdminOrSuperAdmin`, `employeeOrOrgAdmin`, `employeeOnly`, `checkOrganizationAccess`, `checkEmployeeSelfAccess`. Standard chain: `protect → checkOrganizationAccess → role gate`. Almost every resource is nested under `/:organizationId`.
- Login enforces org subscription state (blocks suspended/cancelled/expired; auto-flips non-legacy orgs to `expired`). Orgs have `subscriptionPlan` (starter/professional/enterprise/legacy) and `employeeLimit`; legacy = unlimited.

## CRA tax calculator (the crown jewel — "hybrid scraper")
Path: `routes/taxCalculator.js` → `services/taxCalculator.js` (class `CRAPayrollScraper`, a backward-compat wrapper) → `services/HybridCRAScraper.js` (class `HybridCRAScraperWithExpiry`, the real engine). The backend does **not** compute tax itself — it scrapes CRA:
1. **Puppeteer (headless)** loads `apps.cra-arc.gc.ca/ebci/rhpd/beta/step1` to obtain the `XSRF-TOKEN` cookie (set only by site JS — hence a real browser is required). Token + cookies cached with a **20-minute TTL**.
2. Then **direct axios POSTs** to CRA's private REST API (`.../rest/api/ext/priv/calculator/SALARY` — `/calculateClaimAmounts` for TD1 amounts, `/calculate` for deductions), sending `x-xsrf-token` + cookies.
3. Responses are prefixed with `)]}',` (anti-JSON-hijack); `parseSecureJSON()` strips it. Auto-retries once on 401/403 session expiry.
- All **13 provinces/territories** supported (normalized to CRA UPPER_SNAKE codes); all work in one session. 10 CRA pay-period frequencies in `PAY_FREQUENCIES`.
- **Singleton scraper** reused for session pooling. Perf: first calc ~15s (session init), subsequent ~2.5s. Migrated from Selenium (backup kept at `services/taxCalculator.selenium.backup.js`); claimed 6–10x speedup. Consumers: taxCalculator, payments, payslips, employees, employeeWithLogin routes.

## Services (`services/`)
- **taxCalculator.js / HybridCRAScraper.js** — CRA scraper (above).
- **monthlyPaymentGenerator.js** — payroll automation; `node-cron` `0 23 28-31 * *` (America/Toronto), fires only on the true last day of month; creates `PaymentTracking` per active employee via the scraper. `initializeMonthlyPaymentScheduler()` called from `server.js`.
- **calendarReminderService.js** — cron every minute; creates `Notification` reminders 15 min before `CalendarEvent`s.
- **socketService.js** — Socket.IO: JWT handshake, presence (`UserPresence`), rooms, messaging, typing, read receipts, **WebRTC mesh signaling** for group audio/video calls.
- **dailyService.js** — ⚠️ **misnamed**: not a daily job. It's a **GetStream.io** (`@stream-io/node-sdk`) video wrapper (upsert users, create/get calls, tokens, end calls). Used by chat/meetings/calendar routes.
- **emailService.js** — nodemailer transactional recruitment emails (application received/status updates).
- **cpanelService.js** — cPanel UAPI mailbox provisioning (create/delete POP accounts, change password) via `config/cpanel.js`.
- **cpa005Generator.js** — builds Canadian **CPA-005** bank direct-deposit EFT files (fixed-width A/C/Z records) + CSV.

## Route groups (all under `/api`)
- **Auth/org/billing:** auth, organizations, companyProfiles (multer logo), subscriptions (public e-transfer signup + superadmin approval that provisions org+orgadmin).
- **Payroll/tax/banking:** taxCalculator, payments (XLSX export/import, ADP-style summary, run/confirm payroll), payslips (puppeteer PDF + manual payslips), payslipRequests, manualPayslipEmployees, bankFiles (CPA-005/CSV), transactions (CSV), expenseProjects.
- **HR:** employees, employeeWithLogin (creates Employee + login User together), employeeDocuments, attendance (swipe in/out/break), attendanceRegularization, leave (types/requests/balances), shifts (templates/assignments/two-stage swap approval), offboarding (checklist + settlement), loans, assets (QR codes, requests).
- **Recruitment:** jobs (public careers endpoints), jobApplications (public apply + emailService).
- **Docs/templates:** offerLetters (token e-signature, puppeteer PDF, email), offerLetterTemplates, templates, policies (acknowledgment tracking).
- **Communication:** chat (~1060 lines: conversations, messages, channels, presence, video via GetStream), meetings, calendar (leave/shift overlays), emailAccounts (cPanel + `utils/mailCrypto` encryption), webmail (full IMAP/SMTP client).
- **Learning:** courses (videos/quizzes/certificates/discussions), learningPaths.
- **Misc:** tasks, projects, support (multer attachments), announcements.

## Data model highlights
- `Employee` — huge ADP-WFN-style schema: personal/employment/pay info, `compensationType`, `payPeriodFrequency`, `currentSalary` (gross/net/federal/provincial/cpp/cpp2/ei/employer portions/remittance) + full `salaryHistory[]`, vacation config, province (required, enum of 13).
- `PaymentTracking` — per-employee per-period payroll record; `pre('save')` validates gross − deductions ≈ net (2¢ tolerance) and computes total/balance.
- `Organization` — SMTP + cPanel creds, subscription fields, branding (logo/theme), CAD currency default, `America/Toronto` timezone.
- `Message`/`Conversation` — chat with attachments (base64), reactions, replies, read receipts, edit/delete.
- Others: ManualPayslip, Attendance, Task, Course family, Shift family, Loan family, Offer letters, etc.

## ⚠️ Gotchas / risks (for future work)
- **Hardcoded secrets committed to source:** JWT signing key `'your-super-secret-jwt-key-change-this-in-production'` (in `middleware/auth.js` AND `utils/generateToken.js`), the **MongoDB Atlas URI with credentials** in `config/db.js`, and the **GetStream API key/secret** in `services/dailyService.js`. Env overrides exist only for `MONGODB_URI`. These should move to env vars.
- `config/db.js` uses the **standard seed-list** Mongo URI (not `mongodb+srv://`) deliberately — this machine's DNS refuses c-ares SRV/TXT queries (`querySrv ECONNREFUSED`). SRV is only a fallback.
- **CORS is `origin: '*'`** with credentials.
- Global `unhandledRejection`/`uncaughtException` handlers keep the server alive (log-and-continue) — errors won't crash but can be silently swallowed.
- Puppeteer memory: always `scraper.cleanup()`; routes were patched to do so.
- `dailyService.js` name implies a scheduler but is video (GetStream) — don't be misled.
- Several `test*.js` / `check*.js` scripts and scratch docs (`12.xyz`, `new.html`, `New Text Document.txt`) sit at repo root.

## Running locally
- Install deps in each project (`npm install`). Backend pulls Puppeteer (Chromium download) — slow first time.
- Backend: `npm start` → `http://localhost:5000` (health: `GET /api/health`).
- Frontend: `npm run dev` → `http://localhost:5173`. It reads `VITE_BACKEND_URL`; set `NEXAFLOW_FE/.env` to `VITE_BACKEND_URL=http://localhost:5000` to target the local backend (default `.env.example` points at the Railway production URL).
