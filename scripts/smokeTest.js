/**
 * End-to-end smoke test for the NexaFlow ↔ Jira Dashboard integration.
 *
 * Drives the real HTTP API against a running backend and database. It creates
 * data in a project prefixed `SMOKE` and deletes what it created on the way
 * out, so it is safe to run repeatedly — but it does write, so point it at a
 * staging environment rather than production.
 *
 * Required environment:
 *   SMOKE_API_URL         backend base URL            (default http://localhost:5000)
 *   SMOKE_ADMIN_EMAIL     an org admin with the taskhub package
 *   SMOKE_ADMIN_PASSWORD
 *
 * Optional:
 *   SMOKE_MEMBER_EMAIL    a non-admin with dashboard access, to test approval
 *   SMOKE_MEMBER_PASSWORD    permissions and notification delivery
 *   SMOKE_DENIED_EMAIL    a user WITHOUT dashboard access, to test the gate
 *   SMOKE_DENIED_PASSWORD
 *   SMOKE_HUB_URL         dashboard base URL, to test the session bridge
 *
 * Usage: node scripts/smokeTest.js
 */

const API = (process.env.SMOKE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const HUB = (process.env.SMOKE_HUB_URL || '').replace(/\/+$/, '');

const results = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n${name}`);
}

function record(name, ok, detail = '') {
  results.push({ section: currentSection, name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

/** Run an assertion, catching throws so one failure does not end the run. */
async function test(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (e) {
    record(name, false, e.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Fetch JSON, returning status and body together so tests can assert on both. */
async function call(path, { token, method = 'GET', body, expect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }

  if (expect !== undefined && res.status !== expect) {
    throw new Error(`${method} ${path} → ${res.status} (expected ${expect}): ${JSON.stringify(json)?.slice(0, 160)}`);
  }
  return { status: res.status, body: json };
}

async function login(email, password) {
  const { body } = await call('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    expect: 200
  });
  return body;
}

async function main() {
  console.log('\nNexaFlow ↔ Jira Dashboard — smoke test');
  console.log(`API: ${API}${HUB ? `\nHub: ${HUB}` : ''}`);

  const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      '\nSet SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to an org admin whose\n' +
      'organization holds the taskhub package, then re-run.\n'
    );
    process.exit(2);
  }

  // -------------------------------------------------------------------------
  section('Backend reachable');
  // -------------------------------------------------------------------------

  await test('health endpoint responds', async () => {
    const { body } = await call('/api/health', { expect: 200 });
    assert(body.status === 'ok', 'health did not report ok');
  });

  // -------------------------------------------------------------------------
  section('Authentication and entitlement');
  // -------------------------------------------------------------------------

  let admin;
  await test('org admin can sign in', async () => {
    admin = await login(adminEmail, adminPassword);
    assert(admin.token, 'no token returned');
  });

  if (!admin?.token) {
    console.error('\nCannot continue without an admin session.');
    return finish();
  }

  const adminToken = admin.token;
  const orgId = admin.user.organizationId;

  await test('login payload exposes hubRole', async () => {
    assert(admin.user.hubRole === 'admin', `hubRole was "${admin.user.hubRole}"`);
  });

  await test('login payload exposes resolved module access', async () => {
    assert(typeof admin.user.moduleAccess?.taskhub === 'boolean', 'moduleAccess.taskhub missing');
    assert(admin.user.moduleAccess.taskhub === true, 'admin does not have taskhub access');
  });

  await test('organization lists its packages', async () => {
    assert(Array.isArray(admin.user.organization?.packages), 'organization.packages missing');
    assert(admin.user.organization.packages.includes('taskhub'), 'org does not hold the taskhub package');
  });

  await test('/api/auth/me returns the same shape as login', async () => {
    const { body } = await call('/api/auth/me', { token: adminToken, expect: 200 });
    assert(body.user.hubRole === admin.user.hubRole, 'hubRole differs between login and /me');
    assert(
      body.user.moduleAccess.taskhub === admin.user.moduleAccess.taskhub,
      'moduleAccess differs between login and /me'
    );
  });

  await test('an unauthenticated request is rejected', async () => {
    await call(`/api/taskhub/${orgId}/tasks`, { expect: 401 });
  });

  await test('a garbage token is rejected', async () => {
    await call(`/api/taskhub/${orgId}/tasks`, { token: 'not-a-real-token', expect: 401 });
  });

  await test('another organization is not readable', async () => {
    const otherOrg = '0'.repeat(24);
    const { status } = await call(`/api/taskhub/${otherOrg}/tasks`, { token: adminToken });
    assert(status === 403 || status === 404, `expected 403/404, got ${status}`);
  });

  if (process.env.SMOKE_DENIED_EMAIL && process.env.SMOKE_DENIED_PASSWORD) {
    await test('a user without the module cannot reach the dashboard API', async () => {
      const denied = await login(process.env.SMOKE_DENIED_EMAIL, process.env.SMOKE_DENIED_PASSWORD);
      assert(denied.user.moduleAccess.taskhub === false, 'that user unexpectedly has access');
      const { status, body } = await call(`/api/taskhub/${denied.user.organizationId}/tasks`, {
        token: denied.token
      });
      assert(status === 403, `expected 403, got ${status}`);
      assert(body.missingModule === 'taskhub' || body.missingPackage === 'taskhub', 'no reason given');
    });
  }

  // -------------------------------------------------------------------------
  section('Projects and tasks');
  // -------------------------------------------------------------------------

  const stamp = Date.now().toString().slice(-6);
  let projectId = null;
  let taskId = null;

  await test('members list is available for the assignee picker', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/members`, { token: adminToken, expect: 200 });
    assert(Array.isArray(body.employees), 'employees array missing');
    assert(body.employees.every((e) => e.name && e.email), 'a member is missing name or email');
  });

  await test('a project can be created', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/projects`, {
      token: adminToken,
      method: 'POST',
      body: { name: `Smoke ${stamp}`, key: `SMK${stamp}`.slice(0, 10), description: 'smoke test' },
      expect: 201
    });
    projectId = body.project._id;
    assert(projectId, 'no project id returned');
    assert(body.project.ownerId?.name, 'owner was not populated with a display name');
  });

  await test('duplicate project keys are rejected within an org', async () => {
    await call(`/api/taskhub/${orgId}/projects`, {
      token: adminToken,
      method: 'POST',
      body: { name: `Smoke dup ${stamp}`, key: `SMK${stamp}`.slice(0, 10) },
      expect: 409
    });
  });

  await test('a task can be created in the project', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/tasks`, {
      token: adminToken,
      method: 'POST',
      body: { title: `Smoke task ${stamp}`, projectId, priority: 'high', assignees: [admin.user.id] },
      expect: 201
    });
    taskId = body.task._id;
    assert(taskId, 'no task id returned');
    assert(body.task.status === 'todo', `unexpected initial status ${body.task.status}`);
    assert(body.task.assignees[0]?.name, 'assignee was not populated with a display name');
  });

  await test('the task appears on the kanban board', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/projects/${projectId}/kanban`, {
      token: adminToken,
      expect: 200
    });
    const todo = body.columns.find((c) => c.status === 'todo');
    assert(todo?.tasks.some((t) => t._id === taskId), 'task missing from the todo column');
  });

  await test('a task moves to review', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/tasks/${taskId}`, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'review' },
      expect: 200
    });
    assert(body.task.status === 'review', 'status did not change');
    assert(body.task.completedAt, 'completedAt was not stamped');
  });

  await test('an admin can approve', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/tasks/${taskId}/approve`, {
      token: adminToken,
      method: 'POST',
      expect: 200
    });
    assert(body.task.status === 'approved', 'status did not change');
    assert(body.task.approvedBy?.name, 'approvedBy was not populated');
  });

  await test('reopening clears the approval', async () => {
    const { body } = await call(`/api/taskhub/${orgId}/tasks/${taskId}`, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'in_progress' },
      expect: 200
    });
    assert(body.task.approvedBy === null, 'approvedBy survived the reopen');
    assert(body.task.approvedAt === null, 'approvedAt survived the reopen');
  });

  await test('CSV export returns a header row', async () => {
    const res = await fetch(`${API}/api/taskhub/${orgId}/tasks/export`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `export returned ${res.status}`);
    const text = await res.text();
    assert(text.startsWith('Title,Status,Priority'), 'unexpected CSV header');
  });

  if (process.env.SMOKE_MEMBER_EMAIL && process.env.SMOKE_MEMBER_PASSWORD) {
    await test('a non-admin cannot approve', async () => {
      const member = await login(process.env.SMOKE_MEMBER_EMAIL, process.env.SMOKE_MEMBER_PASSWORD);
      const { status } = await call(`/api/taskhub/${orgId}/tasks/${taskId}/approve`, {
        token: member.token,
        method: 'POST'
      });
      assert(status === 403, `expected 403, got ${status}`);
    });
  }

  // -------------------------------------------------------------------------
  section('Chat — one store shared with the ERP');
  // -------------------------------------------------------------------------

  let conversationId = null;

  await test('a task thread resolves to a bound conversation', async () => {
    const { body } = await call(`/api/chat/${orgId}/conversations/context`, {
      token: adminToken,
      method: 'POST',
      body: { kind: 'taskhub_task', refId: taskId },
      expect: 200
    });
    conversationId = body.conversation._id;
    assert(conversationId, 'no conversation returned');
    assert(body.conversation.context?.kind === 'taskhub_task', 'context binding missing');
  });

  await test('opening the same thread twice reuses one conversation', async () => {
    const { body } = await call(`/api/chat/${orgId}/conversations/context`, {
      token: adminToken,
      method: 'POST',
      body: { kind: 'taskhub_task', refId: taskId },
      expect: 200
    });
    assert(body.conversation._id === conversationId, 'a second conversation was created for the same task');
  });

  await test('the team chat resolves to one org-wide conversation', async () => {
    const first = await call(`/api/chat/${orgId}/conversations/context`, {
      token: adminToken, method: 'POST', body: { kind: 'taskhub_global' }, expect: 200
    });
    const second = await call(`/api/chat/${orgId}/conversations/context`, {
      token: adminToken, method: 'POST', body: { kind: 'taskhub_global' }, expect: 200
    });
    assert(first.body.conversation._id === second.body.conversation._id, 'team chat duplicated');
  });

  await test('a message posted to the thread is readable back', async () => {
    const text = `smoke ${stamp}`;
    await call(`/api/chat/${orgId}/messages`, {
      token: adminToken,
      method: 'POST',
      body: { conversationId, content: text },
      expect: 201
    });
    const { body } = await call(`/api/chat/${orgId}/conversations/${conversationId}/messages`, {
      token: adminToken,
      expect: 200
    });
    assert(body.messages.some((m) => m.content === text), 'message not found after posting');
  });

  await test('the task thread appears in the ERP conversation list', async () => {
    const { body } = await call(`/api/chat/${orgId}/conversations`, { token: adminToken, expect: 200 });
    assert(
      body.conversations.some((c) => String(c._id) === String(conversationId)),
      'the dashboard thread is invisible to the ERP Messages module'
    );
  });

  await test('an unknown context kind is rejected', async () => {
    await call(`/api/chat/${orgId}/conversations/context`, {
      token: adminToken,
      method: 'POST',
      body: { kind: 'nonsense', refId: taskId },
      expect: 400
    });
  });

  // -------------------------------------------------------------------------
  section('Notifications — one inbox, tagged by product');
  // -------------------------------------------------------------------------

  await test('dashboard notifications are readable', async () => {
    const { body } = await call(`/api/notifications/${orgId}?source=taskhub`, {
      token: adminToken,
      expect: 200
    });
    assert(Array.isArray(body.notifications), 'notifications array missing');
    assert(typeof body.unread === 'number', 'unread count missing');
  });

  await test('notifications carry deep-link context', async () => {
    const { body } = await call(`/api/notifications/${orgId}?source=taskhub`, { token: adminToken });
    // Only assert shape on rows that exist — a fresh org may legitimately be empty.
    for (const n of body.notifications.slice(0, 5)) {
      assert('taskId' in n && 'link' in n, 'notification is missing taskId/link');
    }
  });

  await test('marking read is idempotent', async () => {
    await call(`/api/notifications/${orgId}/read`, {
      token: adminToken, method: 'POST', body: { source: 'taskhub' }, expect: 200
    });
    const { body } = await call(`/api/notifications/${orgId}?source=taskhub`, { token: adminToken });
    assert(body.unread === 0, `unread was ${body.unread} after marking all read`);
  });

  // -------------------------------------------------------------------------
  section('Meetings — the ERP calendar, seen from both products');
  // -------------------------------------------------------------------------

  let meetingId = null;

  await test('a meeting can be scheduled', async () => {
    const start = new Date(Date.now() + 3600_000);
    const end = new Date(start.getTime() + 30 * 60_000);
    const { body } = await call(`/api/calendar/${orgId}/events`, {
      token: adminToken,
      method: 'POST',
      body: {
        title: `Smoke meeting ${stamp}`,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        isVirtual: true,
        eventType: 'meeting',
        participants: [{ userId: admin.user.id }]
      }
    });
    meetingId = body.event?._id;
    assert(meetingId, `no event returned: ${JSON.stringify(body).slice(0, 160)}`);
  });

  await test('the meeting appears in the shared calendar', async () => {
    const { body } = await call(`/api/calendar/${orgId}/events`, { token: adminToken, expect: 200 });
    const events = body.events || body;
    const found = events.find((e) => String(e._id) === String(meetingId));
    assert(found, 'meeting missing from the calendar the ERP reads');
    assert(found.isVirtual === true, 'meeting is not marked virtual, so it will not be joinable');
  });

  await test('meeting participants carry display names', async () => {
    const { body } = await call(`/api/calendar/${orgId}/events/${meetingId}`, {
      token: adminToken,
      expect: 200
    });
    const participant = body.event.participants?.[0]?.userId;
    assert(participant && typeof participant === 'object', 'participant was not populated');
    assert('name' in participant, 'participant has no name field, so the UI shows an email');
  });

  await test('RSVP is accepted', async () => {
    await call(`/api/calendar/${orgId}/events/${meetingId}/rsvp`, {
      token: adminToken,
      method: 'PUT',
      body: { status: 'accepted' },
      expect: 200
    });
  });

  // -------------------------------------------------------------------------
  if (HUB) {
    section('Dashboard app');

    await test('the dashboard is reachable at its base path', async () => {
      const res = await fetch(`${HUB}/jiradashboard`, { redirect: 'manual' });
      assert(res.status < 500, `dashboard returned ${res.status}`);
    });

    await test('the session bridge rejects a bogus token', async () => {
      const res = await fetch(`${HUB}/jiradashboard/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'bogus' })
      });
      assert(res.status >= 400, `bridge accepted a bogus token (${res.status})`);
    });

    await test('the session bridge accepts a real token', async () => {
      const res = await fetch(`${HUB}/jiradashboard/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminToken })
      });
      const body = await res.json();
      assert(res.status === 200 && body.hasAccess === true, `bridge said ${res.status}: ${JSON.stringify(body)}`);
    });

    await test('dashboard API routes reject an unauthenticated caller', async () => {
      const res = await fetch(`${HUB}/jiradashboard/api/tasks`);
      assert(res.status === 401, `expected 401, got ${res.status}`);
    });
  }

  // -------------------------------------------------------------------------
  section('Cleanup');
  // -------------------------------------------------------------------------

  await test('the smoke task is removed', async () => {
    if (!taskId) return;
    await call(`/api/taskhub/${orgId}/tasks/${taskId}`, {
      token: adminToken, method: 'DELETE', expect: 200
    });
  });

  await test('the smoke project is archived', async () => {
    if (!projectId) return;
    await call(`/api/taskhub/${orgId}/projects/${projectId}`, {
      token: adminToken, method: 'DELETE', expect: 200
    });
  });

  await test('the smoke meeting is removed', async () => {
    if (!meetingId) return;
    const { status } = await call(`/api/calendar/${orgId}/events/${meetingId}`, {
      token: adminToken, method: 'DELETE'
    });
    assert(status === 200 || status === 204, `delete returned ${status}`);
  });

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  const total = results.length;

  console.log('\n' + '─'.repeat(58));
  if (failed.length === 0) {
    console.log(`ALL SMOKE TESTS PASSED  (${total}/${total})`);
    console.log('─'.repeat(58) + '\n');
    process.exit(0);
  }

  console.log(`${total - failed.length} passed, ${failed.length} FAILED  (${total - failed.length}/${total})`);
  console.log('─'.repeat(58));
  for (const f of failed) console.log(`✗ [${f.section}] ${f.name}\n   ${f.detail}`);
  console.log('');
  process.exit(1);
}

main().catch((e) => {
  console.error('\nSmoke test crashed:', e);
  process.exit(1);
});
