/**
 * Symmetric encryption for mailbox passwords (AES-256-GCM).
 *
 * Used so the in-ERP webmail client can auto-connect without prompting the
 * user for their mailbox password every time. The plaintext is only ever
 * decrypted server-side to open an IMAP/SMTP connection — it is never returned
 * to the client.
 *
 * Set MAIL_SECRET_KEY in the environment (any string) in production.
 */
import crypto from 'crypto';

const KEY = crypto
  .createHash('sha256')
  .update(String(process.env.MAIL_SECRET_KEY || 'nexaflow-mailbox-secret-key-change-me'))
  .digest(); // 32 bytes

export function encryptSecret(plain) {
  if (plain == null) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload) {
  if (!payload) return '';
  try {
    const [ivB64, tagB64, dataB64] = String(payload).split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
