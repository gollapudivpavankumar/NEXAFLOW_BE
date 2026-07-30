/**
 * Migrate the standalone Jira Dashboard database into NexaFlow.
 *
 * The dashboard used to run on its own MongoDB with its own users, projects,
 * tasks and messages. This copies that data into the NexaFlow cluster, stamped
 * with an organization and with every user reference remapped to the matching
 * NexaFlow User.
 *
 * The source database is only ever read. Nothing is deleted or modified there,
 * so it stays available as a rollback.
 *
 * Usage:
 *   node scripts/migrateTaskHub.js --org=<organizationId>              # dry run
 *   node scripts/migrateTaskHub.js --org=<organizationId> --apply
 *   node scripts/migrateTaskHub.js --org=<id> --apply --create-missing-users
 *
 * Environment:
 *   TASKHUB_SOURCE_URI  connection string for the old dashboard database
 *   MONGODB_URI         target NexaFlow database (defaults to config/db.js)
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import { colorFromString } from '../utils/avatarColor.js';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const ORG_ID = getArg('org');
const APPLY = hasFlag('apply');
const CREATE_MISSING_USERS = hasFlag('create-missing-users');
const SOURCE_URI = getArg('source') || process.env.TASKHUB_SOURCE_URI;

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const report = {
  users: { matched: 0, created: 0, unmatched: [] },
  projects: { migrated: 0, skipped: 0 },
  tasks: { migrated: 0, skipped: 0 },
  conversations: { created: 0, reused: 0 },
  messages: { migrated: 0, skipped: 0 },
  warnings: []
};

const log = (...parts) => console.log(...parts);
const warn = (message) => {
  report.warnings.push(message);
  console.warn(`  ! ${message}`);
};

// ---------------------------------------------------------------------------
// Source schemas (loose — we only read)
// ---------------------------------------------------------------------------

const loose = () => new mongoose.Schema({}, { strict: false });

async function main() {
  if (!ORG_ID || !mongoose.Types.ObjectId.isValid(ORG_ID)) {
    console.error('Provide the target organization: --org=<organizationId>');
    process.exit(1);
  }
  if (!SOURCE_URI) {
    console.error('Provide the source database: --source=<uri> or TASKHUB_SOURCE_URI');
    process.exit(1);
  }

  log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — Jira Dashboard migration`);
  log(`Target organization: ${ORG_ID}\n`);

  // Target first, so a bad target fails before we touch the source.
  const { default: connectDB } = await import('../config/db.js');
  await connectDB();

  const { default: User } = await import('../models/User.js');
  const { default: Organization } = await import('../models/Organization.js');
  const { default: TaskHubProject } = await import('../models/TaskHubProject.js');
  const { default: TaskHubTask } = await import('../models/TaskHubTask.js');
  const { default: Conversation } = await import('../models/Conversation.js');
  const { default: Message } = await import('../models/Message.js');

  const organization = await Organization.findById(ORG_ID);
  if (!organization) {
    console.error(`Organization ${ORG_ID} not found in the target database.`);
    process.exit(1);
  }
  log(`Organization: ${organization.name}`);

  if (!organization.packages?.includes('taskhub')) {
    warn(
      `${organization.name} does not hold the "taskhub" package. ` +
      'Migrated data will be invisible until it does. ' +
      `Fix with: db.organizations.updateOne({_id: ObjectId("${ORG_ID}")}, {$addToSet: {packages: "taskhub"}})`
    );
  }

  const source = await mongoose.createConnection(SOURCE_URI, {
    serverSelectionTimeoutMS: 15000
  }).asPromise();
  log(`Source connected: ${source.host}\n`);

  const SrcUser = source.model('User', loose(), 'users');
  const SrcProject = source.model('Project', loose(), 'projects');
  const SrcTask = source.model('Task', loose(), 'tasks');
  const SrcMessage = source.model('Message', loose(), 'messages');

  // -------------------------------------------------------------------------
  // 1. Users — match by email
  // -------------------------------------------------------------------------

  log('Users');
  const sourceUsers = await SrcUser.find({}).lean();
  /** old user _id (string) -> new NexaFlow User _id (ObjectId) */
  const userMap = new Map();

  for (const su of sourceUsers) {
    const email = String(su.email || '').toLowerCase().trim();
    if (!email) {
      warn(`Source user ${su._id} has no email; references to them will be dropped.`);
      continue;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      userMap.set(String(su._id), existing._id);
      report.users.matched += 1;

      // Grant dashboard access and backfill display fields, so migrated people
      // can actually open the thing they are being migrated into.
      if (APPLY) {
        let dirty = false;
        if (!existing.moduleAccess?.taskhub) {
          existing.moduleAccess = { ...(existing.moduleAccess || {}), taskhub: true };
          dirty = true;
        }
        if (!existing.name && su.name) { existing.name = su.name; dirty = true; }
        if (!existing.title && su.title) { existing.title = su.title; dirty = true; }
        if (!existing.avatarColor) {
          existing.avatarColor = su.avatarColor || colorFromString(email);
          dirty = true;
        }
        if (dirty) await existing.save();
      }
      continue;
    }

    if (!CREATE_MISSING_USERS) {
      report.users.unmatched.push(email);
      continue;
    }

    // Create with an unusable random password. These people must go through
    // password reset — copying the old bcrypt hash across would silently carry
    // over credentials the ERP never issued.
    const tempPassword = crypto.randomBytes(24).toString('base64url');
    if (APPLY) {
      const created = await User.create({
        email,
        password: tempPassword,
        name: su.name || email.split('@')[0],
        title: su.title || '',
        avatarColor: su.avatarColor || colorFromString(email),
        role: 'employee',
        organizationId: ORG_ID,
        moduleAccess: { taskhub: true }
      });
      userMap.set(String(su._id), created._id);
    } else {
      userMap.set(String(su._id), new mongoose.Types.ObjectId());
    }
    report.users.created += 1;
    report.users.unmatched.push(`${email} (created, needs password reset)`);
  }

  log(`  matched ${report.users.matched}, created ${report.users.created}, unmatched ${report.users.unmatched.length - report.users.created}`);

  const mapUser = (id) => (id ? userMap.get(String(id)) || null : null);
  const mapUsers = (ids) => (ids || []).map(mapUser).filter(Boolean);

  // Owner fallback: the first org admin, used when a project's original owner
  // could not be matched. Without it the project would fail validation.
  const fallbackOwner = await User.findOne({ organizationId: ORG_ID, role: 'orgadmin' }).select('_id');
  if (!fallbackOwner) {
    warn('No org admin found for fallback ownership. Projects with unmatched owners will be skipped.');
  }

  // -------------------------------------------------------------------------
  // 2. Projects — _ids preserved so child and task references stay valid
  // -------------------------------------------------------------------------

  log('\nProjects');
  const sourceProjects = await SrcProject.find({}).lean();

  for (const sp of sourceProjects) {
    const already = await TaskHubProject.findById(sp._id);
    if (already) {
      report.projects.skipped += 1;
      continue;
    }

    const ownerId = mapUser(sp.ownerId) || fallbackOwner?._id;
    if (!ownerId) {
      warn(`Project "${sp.name}" skipped: owner could not be matched and there is no fallback.`);
      report.projects.skipped += 1;
      continue;
    }

    const doc = {
      _id: sp._id,
      organizationId: ORG_ID,
      name: sp.name,
      key: String(sp.key || sp.name || 'PRJ').toUpperCase().slice(0, 10),
      description: sp.description || '',
      parentProjectId: sp.parentProjectId || null,
      ownerId,
      members: mapUsers(sp.members),
      color: sp.color || '#3b82f6',
      icon: sp.icon || 'folder',
      isArchived: Boolean(sp.isArchived),
      isInternal: Boolean(sp.isInternal),
      createdAt: sp.createdAt,
      updatedAt: sp.updatedAt
    };

    if (APPLY) {
      try {
        await TaskHubProject.create(doc);
      } catch (e) {
        if (e.code === 11000) {
          // Duplicate key within this org — disambiguate rather than lose it.
          doc.key = `${doc.key}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 10);
          await TaskHubProject.create(doc);
          warn(`Project "${sp.name}" key collided; imported as "${doc.key}".`);
        } else {
          throw e;
        }
      }
    }
    report.projects.migrated += 1;
  }
  log(`  migrated ${report.projects.migrated}, already present ${report.projects.skipped}`);

  // -------------------------------------------------------------------------
  // 3. Tasks
  // -------------------------------------------------------------------------

  log('\nTasks');
  const sourceTasks = await SrcTask.find({}).lean();
  const VALID_STATUS = ['todo', 'in_progress', 'review', 'approved'];
  const VALID_PRIORITY = ['low', 'medium', 'high', 'urgent'];

  for (const st of sourceTasks) {
    const already = await TaskHubTask.findById(st._id);
    if (already) {
      report.tasks.skipped += 1;
      continue;
    }

    const createdBy = mapUser(st.createdBy) || fallbackOwner?._id;
    if (!createdBy) {
      warn(`Task "${st.title}" skipped: creator could not be matched.`);
      report.tasks.skipped += 1;
      continue;
    }

    const doc = {
      _id: st._id,
      organizationId: ORG_ID,
      title: st.title,
      description: st.description || '',
      status: VALID_STATUS.includes(st.status) ? st.status : 'todo',
      priority: VALID_PRIORITY.includes(st.priority) ? st.priority : 'medium',
      assignees: mapUsers(st.assignees),
      createdBy,
      dueDate: st.dueDate || null,
      tags: Array.isArray(st.tags) ? st.tags : [],
      approvedBy: mapUser(st.approvedBy),
      approvedAt: st.approvedAt || null,
      completedAt: st.completedAt || null,
      projectId: st.projectId || null,
      parentProjectId: st.parentProjectId || null,
      createdAt: st.createdAt,
      updatedAt: st.updatedAt
    };

    if (APPLY) await TaskHubTask.create(doc);
    report.tasks.migrated += 1;
  }
  log(`  migrated ${report.tasks.migrated}, already present ${report.tasks.skipped}`);

  // -------------------------------------------------------------------------
  // 4. Messages — folded into context-bound conversations
  // -------------------------------------------------------------------------

  log('\nMessages');
  const sourceMessages = await SrcMessage.find({}).sort({ createdAt: 1 }).lean();

  /** cache key -> conversation _id */
  const conversationCache = new Map();

  async function conversationFor(kind, refId, name) {
    const key = `${kind}:${refId}`;
    if (conversationCache.has(key)) return conversationCache.get(key);

    const existing = await Conversation.findOne({
      organizationId: ORG_ID,
      'context.kind': kind,
      'context.refId': refId
    });
    if (existing) {
      conversationCache.set(key, existing._id);
      report.conversations.reused += 1;
      return existing._id;
    }

    if (!APPLY) {
      const fake = new mongoose.Types.ObjectId();
      conversationCache.set(key, fake);
      report.conversations.created += 1;
      return fake;
    }

    const created = await Conversation.create({
      organizationId: ORG_ID,
      participants: [...userMap.values()],
      type: 'channel',
      name,
      isPrivate: kind !== 'taskhub_global',
      createdBy: fallbackOwner?._id || [...userMap.values()][0],
      context: { kind, refId }
    });
    conversationCache.set(key, created._id);
    report.conversations.created += 1;
    return created._id;
  }

  for (const sm of sourceMessages) {
    const senderId = mapUser(sm.author);
    if (!senderId) {
      report.messages.skipped += 1;
      continue;
    }

    let kind = 'taskhub_global';
    let refId = ORG_ID;
    let name = 'Team chat';

    if (sm.scope === 'task' && sm.taskId) {
      kind = 'taskhub_task';
      refId = sm.taskId;
      name = 'Task discussion';
    } else if (sm.scope === 'project' && sm.projectId) {
      kind = 'taskhub_project';
      refId = sm.projectId;
      name = 'Project discussion';
    }

    const conversationId = await conversationFor(kind, refId, name);

    const already = await Message.findById(sm._id);
    if (already) {
      report.messages.skipped += 1;
      continue;
    }

    if (APPLY) {
      await Message.create({
        _id: sm._id,
        conversationId,
        senderId,
        content: sm.text || '',
        type: 'text',
        createdAt: sm.createdAt,
        updatedAt: sm.updatedAt
      });
    }
    report.messages.migrated += 1;
  }
  log(`  migrated ${report.messages.migrated}, skipped ${report.messages.skipped}`);
  log(`  conversations created ${report.conversations.created}, reused ${report.conversations.reused}`);

  // Conversations carry a denormalised last-message summary for the ERP inbox.
  if (APPLY) {
    for (const conversationId of conversationCache.values()) {
      const last = await Message.findOne({ conversationId }).sort({ createdAt: -1 }).lean();
      if (last) {
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessageAt: last.createdAt,
          lastMessageText: String(last.content || '').substring(0, 100)
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  log('\n' + '─'.repeat(58));
  log(APPLY ? 'MIGRATION COMPLETE' : 'DRY RUN COMPLETE — nothing was written');
  log('─'.repeat(58));
  log(`Users       matched ${report.users.matched}  created ${report.users.created}`);
  log(`Projects    ${report.projects.migrated} migrated, ${report.projects.skipped} already present`);
  log(`Tasks       ${report.tasks.migrated} migrated, ${report.tasks.skipped} already present`);
  log(`Messages    ${report.messages.migrated} migrated, ${report.messages.skipped} skipped`);

  const trulyUnmatched = report.users.unmatched.filter((u) => !u.includes('(created'));
  if (trulyUnmatched.length) {
    log(`\nUnmatched source users (${trulyUnmatched.length}) — their work was reassigned to the fallback owner:`);
    for (const email of trulyUnmatched) log(`  · ${email}`);
    log('\nRe-run with --create-missing-users to create NexaFlow accounts for them.');
  }

  if (report.warnings.length) {
    log(`\nWarnings (${report.warnings.length}):`);
    for (const w of report.warnings) log(`  ! ${w}`);
  }

  if (!APPLY) log('\nRe-run with --apply to write these changes.');

  await source.close();
  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('\nMigration failed:', error);
  try { await mongoose.connection.close(); } catch { /* already closed */ }
  process.exit(1);
});
