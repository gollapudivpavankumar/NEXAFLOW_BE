/**
 * Centralised runtime configuration.
 *
 * The JWT secret used to live inline in three separate files. It is read from
 * the environment here, but keeps the historical literal as a fallback so that
 * tokens already issued to live sessions stay valid after this change. Set
 * JWT_SECRET in the deployment environment to rotate it (all users are logged
 * out when you do).
 */

export const JWT_SECRET =
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/** Packages an organization can hold. `hrm` is the payroll/ERP product, `taskhub` is the Jira Dashboard. */
export const PACKAGES = Object.freeze({
  HRM: 'hrm',
  TASKHUB: 'taskhub',
});

export const ALL_PACKAGES = Object.freeze([PACKAGES.HRM, PACKAGES.TASKHUB]);

/**
 * Allowed browser origins. Defaults to `*` so existing deployments keep
 * working; set CORS_ORIGINS to a comma-separated list to lock it down.
 */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * True when the JWT secret is still the shipped default. Used to print a
 * startup warning rather than to change behaviour.
 */
export const USING_DEFAULT_JWT_SECRET = !process.env.JWT_SECRET;
