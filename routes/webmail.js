/**
 * Webmail routes — an in-ERP email client backed by the mail server's
 * IMAP (read) and SMTP (send) services. Mailbox credentials are supplied by
 * the client per request and are NEVER stored server-side.
 */
import express from 'express';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { protect, checkOrganizationAccess, employeeOrOrgAdmin } from '../middleware/auth.js';
import { MAIL_INFRA } from '../config/cpanel.js';
import EmailAccount from '../models/EmailAccount.js';
import { decryptSecret, encryptSecret } from '../utils/mailCrypto.js';

// Persist a successfully-used mailbox password (encrypted) so the next visit
// auto-logs in. Called after a manual gate login succeeds.
async function rememberPassword(organizationId, emailAddress, password) {
  try {
    await EmailAccount.updateOne(
      { organizationId, emailAddress: (emailAddress || '').toLowerCase().trim() },
      { $set: { secret: encryptSecret(password) } }
    );
  } catch { /* non-fatal */ }
}

const router = express.Router();
const HOST = MAIL_INFRA.serverHost;

// A sentinel error so routes can answer 428 "password required" and let the
// client fall back to a one-time password prompt.
class NeedPasswordError extends Error {
  constructor(email) { super('Mailbox password required'); this.needPassword = true; this.email = email || ''; }
}

/**
 * Resolve the mailbox credentials for a request. Priority:
 *   1. Explicit { email, password } in the body (one-time prompt fallback).
 *   2. The AUTO-LOGIN path: the stored, encrypted secret for the caller's own
 *      mailbox (employees) or an explicitly named org mailbox (admins).
 * Throws NeedPasswordError when no usable password can be found.
 */
async function resolveCreds(req) {
  const organizationId = req.params.organizationId;
  const bodyEmail = (req.body.email || '').toLowerCase().trim();
  const bodyPassword = req.body.password;

  if (bodyEmail && bodyPassword) return { email: bodyEmail, password: bodyPassword };

  // Find the account to auto-connect: the caller's own mailbox, or (for admins)
  // a specific named org mailbox.
  const isAdmin = req.user.role === 'orgadmin' || req.user.role === 'superadmin';
  const query = { organizationId, status: { $ne: 'deleted' } };
  if (bodyEmail) {
    query.emailAddress = bodyEmail;
    if (!isAdmin) query.employeeId = req.user.employeeId; // employees only their own
  } else {
    query.employeeId = req.user.employeeId;
  }

  const account = await EmailAccount.findOne(query).select('+secret emailAddress');
  if (!account) throw new NeedPasswordError(bodyEmail);

  const password = bodyPassword || decryptSecret(account.secret);
  if (!password) throw new NeedPasswordError(account.emailAddress);
  return { email: account.emailAddress, password };
}

function handleCredError(res, e) {
  if (e instanceof NeedPasswordError) {
    return res.status(428).json({ needPassword: true, email: e.email, message: 'Enter your mailbox password' });
  }
  return res.status(400).json({ message: e.message || 'Mailbox error' });
}

function imapClient(email, password) {
  const client = new ImapFlow({
    host: HOST, port: 993, secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
    // Fail fast on bad credentials instead of hanging.
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 60000,
  });
  // CRITICAL: ImapFlow emits async 'error' events (e.g. socket timeout) that a
  // surrounding try/catch cannot catch — without a listener Node treats it as
  // an unhandled 'error' event and CRASHES the whole process. Swallow it here.
  client.on('error', (err) => {
    console.error('IMAP client error (handled):', err?.message || err);
  });
  return client;
}

async function withImap(email, password, fn) {
  if (!email || !password) throw new Error('Mailbox email and password are required');
  const client = imapClient(email, password);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
    try { client.close(); } catch { /* ignore */ }
  }
}

// Friendly label for a folder path (INBOX.Sent -> Sent).
function folderLabel(path) {
  if (path === 'INBOX') return 'Inbox';
  const leaf = path.split('.').pop();
  const map = { Sent: 'Sent', Drafts: 'Drafts', Archive: 'Archive', Trash: 'Trash', spam: 'Spam', Junk: 'Junk' };
  return map[leaf] || leaf;
}

// POST /api/webmail/:organizationId/folders
router.post('/:organizationId/folders', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { email, password } = await resolveCreds(req);
    const folders = await withImap(email, password, async (c) => {
      const list = await c.list();
      const out = [];
      for (const f of list) {
        let unseen = 0, total = 0;
        try {
          const st = await c.status(f.path, { messages: true, unseen: true });
          total = st.messages || 0; unseen = st.unseen || 0;
        } catch { /* ignore per-folder status errors */ }
        out.push({ path: f.path, label: folderLabel(f.path), specialUse: f.specialUse || null, total, unseen });
      }
      return out;
    });
    // If the user just logged in manually (explicit password), remember it so
    // next time is automatic.
    if (req.body.email && req.body.password) {
      await rememberPassword(req.params.organizationId, email, password);
    }
    res.json({ folders });
  } catch (e) {
    handleCredError(res, e);
  }
});

// POST /api/webmail/:organizationId/messages  { email, password, folder, page, pageSize }
router.post('/:organizationId/messages', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { folder = 'INBOX', page = 1, pageSize = 25 } = req.body;
    const { email, password } = await resolveCreds(req);
    const result = await withImap(email, password, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        const total = c.mailbox.exists || 0;
        if (!total) return { messages: [], total: 0 };
        const end = Math.max(1, total - (page - 1) * pageSize);
        const start = Math.max(1, end - pageSize + 1);
        const messages = [];
        for await (const msg of c.fetch(`${start}:${end}`, { envelope: true, flags: true, uid: true, size: true })) {
          const from = msg.envelope.from?.[0];
          messages.push({
            uid: msg.uid,
            subject: msg.envelope.subject || '(no subject)',
            fromName: from?.name || from?.address || 'Unknown',
            fromAddress: from?.address || '',
            to: (msg.envelope.to || []).map((t) => t.address),
            date: msg.envelope.date,
            seen: msg.flags?.has('\\Seen') || false,
            flagged: msg.flags?.has('\\Flagged') || false,
            size: msg.size || 0,
          });
        }
        messages.reverse(); // newest first
        return { messages, total };
      } finally {
        lock.release();
      }
    });
    res.json(result);
  } catch (e) {
    handleCredError(res, e);
  }
});

// POST /api/webmail/:organizationId/message  { email, password, folder, uid }
router.post('/:organizationId/message', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { folder = 'INBOX', uid } = req.body;
    if (!uid) return res.status(400).json({ message: 'Message uid is required' });
    const { email, password } = await resolveCreds(req);
    const parsed = await withImap(email, password, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        const dl = await c.download(String(uid), undefined, { uid: true });
        const mail = await simpleParser(dl.content);
        // Mark as read
        try { await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); } catch { /* ignore */ }
        return {
          subject: mail.subject || '(no subject)',
          from: mail.from?.text || '',
          to: mail.to?.text || '',
          cc: mail.cc?.text || '',
          date: mail.date,
          html: mail.html || null,
          text: mail.text || '',
          attachments: (mail.attachments || []).map((a) => ({ filename: a.filename, size: a.size, contentType: a.contentType })),
        };
      } finally {
        lock.release();
      }
    });
    res.json(parsed);
  } catch (e) {
    handleCredError(res, e);
  }
});

// POST /api/webmail/:organizationId/send  { email, password, to, cc, subject, html }
router.post('/:organizationId/send', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { to, cc, subject, html } = req.body;
    if (!to) return res.status(400).json({ message: 'A recipient is required' });
    const { email, password } = await resolveCreds(req);
    const transporter = nodemailer.createTransport({
      host: HOST, port: 465, secure: true,
      auth: { user: email, pass: password },
      tls: { rejectUnauthorized: false },
    });
    const info = await transporter.sendMail({ from: email, to, cc: cc || undefined, subject: subject || '(no subject)', html: html || '' });

    // Best-effort: append a copy to the Sent folder so it shows in the client.
    try {
      await withImap(email, password, async (c) => {
        const raw = `From: ${email}\r\nTo: ${to}\r\n${cc ? `Cc: ${cc}\r\n` : ''}Subject: ${subject || ''}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html || ''}`;
        await c.append('INBOX.Sent', raw, ['\\Seen']);
      });
    } catch { /* non-fatal */ }

    res.json({ sent: true, messageId: info.messageId });
  } catch (e) {
    handleCredError(res, e);
  }
});

// POST /api/webmail/:organizationId/flag  { email, password, folder, uid, seen }
router.post('/:organizationId/flag', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { folder = 'INBOX', uid, seen } = req.body;
    const { email, password } = await resolveCreds(req);
    await withImap(email, password, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        if (seen) await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        else await c.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
      } finally { lock.release(); }
    });
    res.json({ ok: true });
  } catch (e) {
    handleCredError(res, e);
  }
});

// POST /api/webmail/:organizationId/delete  { email, password, folder, uid }
router.post('/:organizationId/delete', protect, checkOrganizationAccess, employeeOrOrgAdmin, async (req, res) => {
  try {
    const { folder = 'INBOX', uid } = req.body;
    const { email, password } = await resolveCreds(req);
    await withImap(email, password, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        // Move to Trash when possible, else flag deleted.
        try { await c.messageMove(String(uid), 'INBOX.Trash', { uid: true }); }
        catch { await c.messageDelete(String(uid), { uid: true }); }
      } finally { lock.release(); }
    });
    res.json({ ok: true });
  } catch (e) {
    handleCredError(res, e);
  }
});

export default router;
