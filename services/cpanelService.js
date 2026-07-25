/**
 * cPanel UAPI Wrapper Service
 *
 * Provides functions to manage email accounts through the cPanel UAPI.
 * Each function requires an organization object with cPanel credentials:
 *   - org.cpanelHost     (hostname of the cPanel server)
 *   - org.cpanelPort     (port, defaults to 2083)
 *   - org.cpanelUsername  (cPanel account username)
 *   - org.cpanelApiToken  (cPanel API token)
 *   - org.cpanelDomain    (domain for email accounts)
 */

import axios from 'axios';
import https from 'https';
import { resolveCpanelConfig } from '../config/cpanel.js';

/**
 * Build a cPanel HTTP client configuration.
 * Merges the org's own cPanel settings over the SHARED account defaults, so
 * every org can provision email through the shared cPanel without per-org setup.
 *
 * @param {Object} org - Organization (may have cpanel* fields)
 * @returns {{ baseURL: string, headers: Object, httpsAgent: https.Agent, domain: string }}
 */
function getCpanelClient(org = {}) {
  const cfg = resolveCpanelConfig(org);
  if (!cfg.cpanelHost || !cfg.cpanelUsername || !cfg.cpanelApiToken) {
    throw new Error('cPanel is not configured');
  }

  return {
    baseURL: `https://${cfg.cpanelHost}:${cfg.cpanelPort || 2083}`,
    headers: {
      Authorization: `cpanel ${cfg.cpanelUsername}:${cfg.cpanelApiToken}`,
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    domain: cfg.cpanelDomain,
  };
}

/**
 * Create a new email account on the cPanel server.
 *
 * @param {Object} org - Organization with cPanel configuration
 * @param {string} username - Local part of the email address (before @)
 * @param {string} password - Password for the new email account
 * @param {number} [quota=1024] - Mailbox quota in MB
 * @returns {Promise<Object>} cPanel API response data
 */
export async function createEmailAccount(org, username, password, quota = 1024) {
  try {
    const config = getCpanelClient(org);
    const domain = config.domain;

    const params = new URLSearchParams({
      email: username,
      password: password,
      quota: String(quota),
      domain: domain,
    });

    const response = await axios.get(
      `${config.baseURL}/execute/Email/add_pop?${params.toString()}`,
      {
        headers: config.headers,
        httpsAgent: config.httpsAgent,
      }
    );

    return response.data;
  } catch (error) {
    console.error('cPanel createEmailAccount error:', error.message);
    throw error;
  }
}

/**
 * Delete an existing email account from the cPanel server.
 *
 * @param {Object} org - Organization with cPanel configuration
 * @param {string} emailAddress - Full email address to delete (user@domain)
 * @returns {Promise<Object>} cPanel API response data
 */
export async function deleteEmailAccount(org, emailAddress) {
  try {
    const config = getCpanelClient(org);

    const [username, domain] = emailAddress.split('@');

    const params = new URLSearchParams({
      email: username,
      domain: domain || config.domain,
    });

    const response = await axios.get(
      `${config.baseURL}/execute/Email/delete_pop?${params.toString()}`,
      {
        headers: config.headers,
        httpsAgent: config.httpsAgent,
      }
    );

    return response.data;
  } catch (error) {
    console.error('cPanel deleteEmailAccount error:', error.message);
    throw error;
  }
}

/**
 * Change the password for an existing email account.
 *
 * @param {Object} org - Organization with cPanel configuration
 * @param {string} emailAddress - Full email address (user@domain)
 * @param {string} newPassword - New password to set
 * @returns {Promise<Object>} cPanel API response data
 */
export async function changeEmailPassword(org, emailAddress, newPassword) {
  try {
    const config = getCpanelClient(org);

    const [username, domain] = emailAddress.split('@');

    const params = new URLSearchParams({
      email: username,
      password: newPassword,
      domain: domain || config.domain,
    });

    const response = await axios.get(
      `${config.baseURL}/execute/Email/passwd_pop?${params.toString()}`,
      {
        headers: config.headers,
        httpsAgent: config.httpsAgent,
      }
    );

    return response.data;
  } catch (error) {
    console.error('cPanel changeEmailPassword error:', error.message);
    throw error;
  }
}

/**
 * List all email accounts (POP accounts) on the cPanel server.
 *
 * @param {Object} org - Organization with cPanel configuration
 * @returns {Promise<Object>} cPanel API response data containing email account list
 */
export async function listEmailAccounts(org) {
  try {
    const config = getCpanelClient(org);

    const response = await axios.get(
      `${config.baseURL}/execute/Email/list_pops`,
      {
        headers: config.headers,
        httpsAgent: config.httpsAgent,
      }
    );

    return response.data;
  } catch (error) {
    console.error('cPanel listEmailAccounts error:', error.message);
    throw error;
  }
}

/**
 * Test the cPanel connection by attempting to list email accounts.
 *
 * @param {Object} org - Organization with cPanel configuration
 * @returns {Promise<{ success: boolean, message: string, data?: Object }>}
 */
export async function testConnection(org) {
  try {
    const data = await listEmailAccounts(org);
    return {
      success: true,
      message: 'cPanel connection successful',
      data: data,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || 'cPanel connection failed',
    };
  }
}
