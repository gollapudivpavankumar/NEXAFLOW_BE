/**
 * Static verification of the NexaFlow ↔ Jira Dashboard integration.
 *
 * Runs without a database or a running server, so it can gate a build. It
 * checks the invariants that make the integration correct — package isolation,
 * tenant scoping, single-source-of-truth for chat and meetings, entitlement
 * gating — rather than re-testing framework behaviour.
 *
 * The dashboard is built as routes inside NEXAFLOW_FE rather than a separate
 * application. That is deliberate: a second app meant a second session, a
 * second routing prefix and its own branding, and every one of those leaked a
 * bug. Several checks below exist to keep it that way.
 *
 * Usage: node scripts/verifyIntegration.js
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BE = join(HERE, '..');
const ROOT = join(BE, '..');
const FE = join(ROOT, 'NEXAFLOW_FE');
const HUB = join(FE, 'src', 'pages', 'taskhub');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(dir, extensions, collected = []) {
  if (!existsSync(dir)) return collected;
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'dist'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, extensions, collected);
    else if (extensions.some((e) => entry.endsWith(e))) collected.push(full);
  }
  return collected;
}

console.log('\nNexaFlow ↔ Jira Dashboard — integration checks\n');

// ---------------------------------------------------------------------------
console.log('Package isolation (the Jira Dashboard must be sellable standalone)');
// ---------------------------------------------------------------------------

const taskhubBackendSources = [
  join(BE, 'models/TaskHubProject.js'),
  join(BE, 'models/TaskHubTask.js'),
  join(BE, 'routes/taskhub.js'),
  join(BE, 'utils/userDirectory.js'),
  join(BE, 'services/taskHubNotify.js'),
];

for (const file of taskhubBackendSources) {
  const source = read(file);
  const name = relative(ROOT, file);
  check(`${name} exists`, source.length > 0);
  check(
    `${name} never references the Employee model`,
    !/Employee/.test(stripComments(source)),
    'Task Hub code must depend only on User and Organization'
  );
}

// ---------------------------------------------------------------------------
console.log('\nTenant scoping (no cross-organization leaks)');
// ---------------------------------------------------------------------------

const taskhubRoutes = read(join(BE, 'routes/taskhub.js'));
const routeDeclarations = [...taskhubRoutes.matchAll(/router\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)];

check('taskhub routes are declared', routeDeclarations.length > 0);
check(
  'every taskhub route is organization-scoped',
  routeDeclarations.every(([, , path]) => path.startsWith('/:organizationId')),
  routeDeclarations.filter(([, , p]) => !p.startsWith('/:organizationId')).map(([, , p]) => p).join(', ')
);
check(
  'every taskhub route applies the shared guard chain',
  routeDeclarations.length ===
    [...taskhubRoutes.matchAll(/router\.(?:get|post|patch|put|delete)\(\s*'[^']+',\s*guard,/g)].length,
  'each route must pass `guard` — auth + org + package + module'
);
check(
  'the guard chain checks package and module entitlement',
  /requirePackage\(PACKAGES\.TASKHUB\)/.test(taskhubRoutes) && /requireModule\(PACKAGES\.TASKHUB\)/.test(taskhubRoutes)
);
check(
  'CSV export is declared before the /tasks/:taskId route',
  taskhubRoutes.indexOf("'/:organizationId/tasks/export'") < taskhubRoutes.indexOf("'/:organizationId/tasks/:taskId'"),
  'otherwise "export" is captured as a task id'
);

const taskModel = read(join(BE, 'models/TaskHubTask.js'));
const projectModel = read(join(BE, 'models/TaskHubProject.js'));
check('TaskHubTask requires organizationId', /organizationId[\s\S]{0,200}required:\s*true/.test(taskModel));
check('TaskHubProject requires organizationId', /organizationId[\s\S]{0,200}required:\s*true/.test(projectModel));
check(
  'project keys are unique per organization, not globally',
  /organizationId:\s*1,\s*key:\s*1\s*\},\s*\{\s*unique:\s*true/.test(projectModel)
);
check(
  'taskhub collections are named distinctly',
  /collection:\s*'taskhub_projects'/.test(projectModel) && /collection:\s*'taskhub_tasks'/.test(taskModel),
  'must not collide with the HRM projects/tasks collections'
);

// ---------------------------------------------------------------------------
console.log('\nAuth (one secret, one identity, two gates)');
// ---------------------------------------------------------------------------

for (const file of ['middleware/auth.js', 'utils/generateToken.js', 'services/socketService.js']) {
  const source = read(join(BE, file));
  check(
    `${file} reads the JWT secret from config`,
    /JWT_SECRET/.test(source) && !/'your-super-secret-jwt-key-change-this-in-production'/.test(source)
  );
}
check(
  'config/env.js keeps the historical secret as a fallback',
  /your-super-secret-jwt-key-change-this-in-production/.test(read(join(BE, 'config/env.js'))),
  'so tokens already issued stay valid across this change'
);

const authPayload = read(join(BE, 'utils/authPayload.js'));
check('auth payload resolves both entitlement gates into one flag', /orgHasTaskhub\s*&&\s*taskhubGranted/.test(authPayload));
check('auth payload exposes hubRole', /hubRole/.test(authPayload));
check('login and /me share one serializer', (read(join(BE, 'routes/auth.js')).match(/serializeAuthUser/g) || []).length >= 2);

const userModel = read(join(BE, 'models/User.js'));
check(
  'User.employeeId is optional (Task-Hub-only orgs have no payroll records)',
  /employeeId:\s*\{[\s\S]{0,220}required:\s*false/.test(userModel)
);
check('User carries moduleAccess.taskhub', /moduleAccess:\s*\{[\s\S]{0,120}taskhub/.test(userModel));
check('Organization carries packages[]', /packages:\s*\{[\s\S]{0,160}'taskhub'/.test(read(join(BE, 'models/Organization.js'))));

const withLogin = read(join(BE, 'routes/employeeWithLogin.js'));
check('employee creation accepts a taskhubAccess grant', /taskhubAccess/.test(withLogin));
check('granting a package the org lacks is rejected', /missingPackage:\s*'taskhub'/.test(withLogin));
check('module access can be toggled on an existing employee', /module-access/.test(withLogin));
check('User.name is set at creation so chat and meetings show a name', /name,\s*\n/.test(withLogin));

// ---------------------------------------------------------------------------
console.log('\nOne source of truth (nothing is copied, so nothing can drift)');
// ---------------------------------------------------------------------------

const conversationModel = read(join(BE, 'models/Conversation.js'));
check('Conversation supports a context binding', /context:\s*\{[\s\S]{0,200}taskhub_task/.test(conversationModel));
check(
  'the bound-conversation index uses partialFilterExpression, not sparse',
  /partialFilterExpression/.test(conversationModel),
  'a sparse compound unique index would collide on every context-less DM'
);

const chatRoutes = read(join(BE, 'routes/chat.js'));
check('chat exposes get-or-create for bound conversations', /conversations\/context/.test(chatRoutes));
check('the create race is handled', /11000/.test(chatRoutes), 'two tabs can open the same thread at once');
check('mentions notify the people mentioned', /extractMentionIds/.test(chatRoutes));

const chatPage = read(join(HUB, 'TaskHubChat.jsx'));
check(
  'the chat screen reads the real conversation list',
  /chatAPI\.getConversations/.test(chatPage),
  'showing only a synthetic room is what made chat look unsynced'
);
check('the chat screen surfaces direct messages, not just boards', /'direct'/.test(chatPage));
check('the chat screen ensures the shared team channel exists', /taskhub_global/.test(chatPage));

const meetingsPage = read(join(HUB, 'TaskHubMeetings.jsx'));
check(
  'meetings read the ERP calendar, not the unused Meeting model',
  /calendarAPI/.test(meetingsPage) && !/taskhubAPI\.getMeetings|\/api\/meetings/.test(meetingsPage),
  'the ERP schedules meetings as virtual CalendarEvents; the Meeting model is dead code'
);
check(
  'the calendar service really targets /calendar',
  /calendarAPI = \{[\s\S]{0,400}\/calendar\/\$\{orgId\}\/events/.test(read(join(FE, 'src/services/api.js')))
);
check('meetings filter to virtual events', /isVirtual/.test(meetingsPage));
check('joining hands off to the shared ERP call screen', /\/meet\/\$\{meeting\._id\}/.test(meetingsPage));
check(
  'the ERP join route derives the shared call id',
  /`meeting-\$\{meeting\._id\}`/.test(read(join(FE, 'src/pages/MeetingJoin.jsx'))),
  'both entry points must compute the same id or Join splits the room'
);

// ---------------------------------------------------------------------------
console.log('\nDashboard is part of the ERP app, not a second application');
// ---------------------------------------------------------------------------

const expectedPages = [
  'TaskHubDashboard.jsx', 'TaskHubProjects.jsx', 'TaskHubProjectDetail.jsx',
  'TaskHubTasks.jsx', 'TaskHubChat.jsx', 'TaskHubMeetings.jsx', 'TaskHubMembers.jsx',
  'KanbanBoard.jsx', 'TaskDrawer.jsx', 'constants.jsx', 'useTaskHub.js',
];
for (const page of expectedPages) {
  check(`taskhub/${page} exists`, existsSync(join(HUB, page)));
}

const appJsx = read(join(FE, 'src/App.jsx'));
const expectedRoutes = [
  '/jiradashboard', '/jiradashboard/projects', '/jiradashboard/projects/:projectId',
  '/jiradashboard/tasks', '/jiradashboard/chat', '/jiradashboard/meetings', '/jiradashboard/members',
];
for (const route of expectedRoutes) {
  check(`route ${route} is registered`, appJsx.includes(`path="${route}"`));
}
check(
  'every dashboard route is wrapped in the entitlement guard',
  (appJsx.match(/path="\/jiradashboard[^"]*"\s+element=\{<TaskHubRoute>/g) || []).length === expectedRoutes.length + 1,
  'including /jiradashboard/tasks/:taskId'
);

const guard = read(join(FE, 'src/components/TaskHubRoute.jsx'));
check('the route guard checks the resolved entitlement flag', /moduleAccess\?\.taskhub/.test(guard));
check(
  'the guard distinguishes "org lacks package" from "user lacks grant"',
  /packages\?\.includes\('taskhub'\)/.test(guard),
  'they need different actions from the user'
);

// A bookmark or a shared task link must land people in this product, not on
// the ERP login and then the payroll home page.
const hubLogin = read(join(HUB, 'TaskHubLogin.jsx'));
check('the dashboard has its own sign-in screen', hubLogin.length > 0);
check('that sign-in route is public', appJsx.includes('path="/jiradashboard/login" element={<TaskHubLogin />}'));
check(
  'the guard sends signed-out users to the dashboard login',
  /Navigate to="\/jiradashboard\/login"/.test(guard),
  'sending them to the ERP login strands them in the wrong product'
);
check(
  'the intended destination survives the sign-in',
  /state=\{\{ from:/.test(guard) && /location\.state\?\.from/.test(hubLogin)
);
check('the sign-in uses the shared NexaFlow account', /useAuth/.test(hubLogin) && !/passwordHash|bcrypt/.test(hubLogin));
check(
  'the sign-in explains a missing entitlement rather than failing blankly',
  /packages\?\.includes\('taskhub'\)/.test(hubLogin)
);

// The dashboard is a separate product and must look like one once you are
// inside it. Sharing the session is the point; sharing the chrome is not.
const hubLayout = read(join(HUB, 'TaskHubLayout.jsx'));
check('the dashboard has its own shell', hubLayout.length > 0);
check('the guard applies that shell, not the ERP Layout', /<TaskHubLayout>/.test(guard) && !/from '\.\.\/components\/Layout'/.test(guard));
check('the shell carries its own navigation', /Overview[\s\S]{0,400}Boards[\s\S]{0,400}Tasks/.test(hubLayout));
check('the shell offers a way back to the ERP', /Back to NexaFlow/.test(hubLayout));
check('the shell brands from the org record', /org\?\.logo/.test(hubLayout), 'never a hardcoded logo');
check(
  'the shell keeps mobile navigation reachable',
  /taskhub-mobile-toggle/.test(hubLayout),
  'both navs hide below lg, so a burger must appear at the same breakpoint'
);

// Two navigation orientations, because the right one depends on the screen and
// the work — a sidebar suits deep project trees, a top bar gives boards width.
check('the shell offers both nav orientations', /navMode/.test(hubLayout) && /'horizontal'/.test(hubLayout));
check('the orientation switch appears in both modes', (hubLayout.match(/navModeSwitch/g) || []).length >= 3);
check(
  'the chosen orientation is remembered',
  /localStorage\.setItem\(NAV_MODE_KEY/.test(hubLayout) && /localStorage\.getItem\(NAV_MODE_KEY/.test(hubLayout)
);
check(
  'reading the stored orientation cannot break private browsing',
  /catch \{ \/\* private mode \*\/ \}/.test(hubLayout),
  'localStorage.setItem throws when storage is disabled'
);
check('the horizontal nav is styled', /\.taskhub-topnav\b/.test(read(join(HUB, 'taskhub.css'))));

// The login is the product's front door and gets its own proportions.
check(
  'the login uses a 70/30 split',
  /grid-template-columns:\s*70fr 30fr/.test(read(join(HUB, 'taskhub.css')))
);
check(
  'the story panel is dropped rather than squeezed on small screens',
  /\.taskhub-login-story \{ display: none; \}/.test(read(join(HUB, 'taskhub.css'))),
  'a narrow gradient sliver reads as decoration, not brand'
);

const hubCss = read(join(HUB, 'taskhub.css'));
check('the dashboard has its own design layer', hubCss.length > 0);
check(
  'that design layer is scoped and cannot leak into the ERP',
  /^\.taskhub-app \{/m.test(hubCss) &&
    !/^\s*\.ant-(card|table|menu)[^{]*\{/m.test(hubCss),
  'unscoped antd overrides would restyle every ERP screen'
);
check('the shell applies the scope', /className="taskhub-app"/.test(hubLayout));

// The whole point of folding the dashboard in was to delete the second-app
// machinery. If any of it comes back, so do the bugs it caused.
check('no session bridge remains', !existsSync(join(FE, 'src/services/jiraDashboard.js')));
const authContext = read(join(FE, 'src/context/AuthContext.jsx'));
check('AuthContext no longer syncs a second session', !/syncJiraDashboardSession/.test(authContext));
check('AuthContext still exposes hasJiraDashboard for the nav', /hasJiraDashboard/.test(authContext));
check(
  'no /jiradashboard rewrite in vercel.json',
  !/jiradashboard/.test(read(join(FE, 'vercel.json'))),
  'the dashboard is an SPA route now; a rewrite would intercept it'
);
check(
  'no /jiradashboard proxy in vite.config.js',
  !/jiradashboard/.test(read(join(FE, 'vite.config.js'))),
  'a dev proxy would shadow the SPA route'
);

const layout = read(join(FE, 'src/components/Layout.jsx'));
check('the ERP sidebar links to the Jira Dashboard', /jiraDashboardGroup/.test(layout));
check('that link is gated on entitlement', /hasJiraDashboard/.test(layout));
check(
  'the ERP offers one link out, not a mirror of the dashboard nav',
  (layout.match(/key: '\/jiradashboard/g) || []).length === 1,
  'duplicating the dashboard menu inside the ERP undoes the separation'
);
check(
  'the link navigates internally, not by document load',
  !/openJiraDashboard/.test(layout),
  'same React app — a full page load would drop the session for no reason'
);
check(
  'the ERP shell renders the organization logo',
  /user\?\.organization\?\.logo/.test(layout)
);

// A hardcoded logo in any dashboard screen would defeat the point.
const hubSources = walk(HUB, ['.jsx', '.js']);
const hardcodedLogos = hubSources.filter((f) => /https?:\/\/[^\s"')]*\.(png|jpg|jpeg|svg)/i.test(stripComments(read(f))));
check(
  'no dashboard screen hardcodes a logo or image URL',
  hardcodedLogos.length === 0,
  hardcodedLogos.map((f) => relative(FE, f)).join(', ')
);

// ---------------------------------------------------------------------------
console.log('\nAPI wiring');
// ---------------------------------------------------------------------------

const apiService = read(join(FE, 'src/services/api.js'));
check('taskHubAPI is defined', /export const taskHubAPI/.test(apiService));
check('notificationAPI is defined', /export const notificationAPI/.test(apiService));
check('conversationContextAPI is defined', /export const conversationContextAPI/.test(apiService));
check(
  'dashboard screens call the API service, not raw axios paths',
  hubSources.filter((f) => /axios\.(get|post|put|patch|delete)\(['"`]\/api/.test(read(f))).length === 0,
  'raw relative axios calls bypass the auth interceptor'
);
check(
  'every taskHubAPI path is organization-scoped',
  (apiService.match(/\/taskhub\/\$\{orgId\}/g) || []).length >= 14,
  'the backend rejects unscoped calls, so the client must always pass the org'
);

// ---------------------------------------------------------------------------
console.log('\nRealtime (one Socket.IO connection, shared by both products)');
// ---------------------------------------------------------------------------

const socketService = read(join(BE, 'services/socketService.js'));
check('backend can emit to specific users', /export function emitToUsers/.test(socketService));
check('backend can emit to an organization', /export function emitToOrg/.test(socketService));
check(
  'taskhub mutations broadcast to the org',
  ['task_created', 'task_updated', 'task_deleted', 'project_updated'].every((e) => taskhubRoutes.includes(`taskhub:${e}`))
);
check(
  'notifications are pushed as well as stored',
  /emitToUsers\(recipients, 'notification'/.test(read(join(BE, 'services/taskHubNotify.js')))
);

const hooks = read(join(HUB, 'useTaskHub.js'));
check('the dashboard subscribes to taskhub events', /taskhub:task_updated/.test(hooks));
check('it reuses the ERP socket rather than opening another', /getSocket/.test(hooks));
check('realtime refreshes are debounced', /setTimeout\(\(\) => onChange/.test(hooks));
check(
  'realtime refreshes are quiet',
  /quiet:\s*true/.test(hooks),
  'a background refresh must not raise a spinner or an error toast'
);
check(
  'entitlement errors are explained, not flattened',
  /missingPackage/.test(hooks) && /missingModule/.test(hooks),
  'the user needs to know whether to call support or their admin'
);

// ---------------------------------------------------------------------------
console.log('\nServer wiring');
// ---------------------------------------------------------------------------

const server = read(join(BE, 'server.js'));
check('taskhub routes are mounted', /app\.use\('\/api\/taskhub', taskHubRoutes\)/.test(server));
check('notification routes are mounted', /app\.use\('\/api\/notifications', notificationRoutes\)/.test(server));
check(
  'CORS does not pair a wildcard origin with credentials',
  /allowAllOrigins[\s\S]{0,120}\{ origin: '\*' \}/.test(server)
);
check('startup warns when the JWT secret is the default', /USING_DEFAULT_JWT_SECRET/.test(server));

// ---------------------------------------------------------------------------

console.log('\n' + '─'.repeat(58));
if (failures.length === 0) {
  console.log(`ALL CHECKS PASSED  (${passed}/${passed})`);
  console.log('─'.repeat(58) + '\n');
  process.exit(0);
}

console.log(`${passed} passed, ${failures.length} FAILED  (${passed}/${passed + failures.length})`);
console.log('─'.repeat(58));
for (const f of failures) {
  console.log(`✗ ${f.name}`);
  if (f.detail) console.log(`   ${f.detail}`);
}
console.log('');
process.exit(1);
