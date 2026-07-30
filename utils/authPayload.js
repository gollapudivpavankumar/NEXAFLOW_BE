import { colorFromString } from './avatarColor.js';

/**
 * The single shape every auth response uses.
 *
 * Both frontends read this: the ERP to decide which nav items to render, and
 * the Jira Dashboard to build its session. Keeping one serializer means the two
 * can never disagree about who someone is or what they may open.
 *
 * @param {object} user - A User document.
 * @param {object|null} organization - The user's Organization, if any.
 * @param {object|null} employee - The user's Employee record, if any.
 * @returns {object}
 */
export function serializeAuthUser(user, organization = null, employee = null) {
  const packages = organization?.packages?.length ? organization.packages : ['hrm'];
  const isAdmin = user.role === 'superadmin' || user.role === 'orgadmin';

  // Admins administer the dashboard, so they never need an explicit grant.
  const taskhubGranted = isAdmin || Boolean(user.moduleAccess?.taskhub);
  const orgHasTaskhub = user.role === 'superadmin' || packages.includes('taskhub');

  const name = user.name?.trim() || employee?.name?.trim() || user.email?.split('@')[0] || '';

  return {
    id: user._id,
    email: user.email,
    name,
    title: user.title || employee?.jobTitle || employee?.position || '',
    avatarColor: user.avatarColor || colorFromString(user.email || ''),
    role: user.role,
    // How the Jira Dashboard sees this person: it only knows admins and members.
    hubRole: isAdmin ? 'admin' : 'employee',
    organizationId: user.organizationId,
    employeeId: user.employeeId,
    moduleAccess: {
      // Both gates resolved into one boolean the frontends can trust directly,
      // so neither has to re-implement the entitlement rules.
      taskhub: orgHasTaskhub && taskhubGranted
    },
    organization: organization
      ? {
        id: organization._id,
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        logo: organization.logo,
        themeColor: organization.themeColor,
        packages,
        subscriptionStatus: organization.subscriptionStatus,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionEndDate: organization.subscriptionEndDate
      }
      : null,
    employee: employee
      ? {
        id: employee._id,
        name: employee.name,
        email: employee.email
      }
      : null
  };
}

export default serializeAuthUser;
