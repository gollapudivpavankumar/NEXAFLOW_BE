/**
 * Deterministic avatar colour from a string.
 *
 * Mirrors `colorFromString` in the Jira Dashboard's lib/utils.ts so a user's
 * avatar is the same colour in both products. Keep the palettes identical.
 */
const PALETTE = [
  '#0098f0', '#7c3aed', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export function colorFromString(input) {
  const s = String(input || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default colorFromString;
