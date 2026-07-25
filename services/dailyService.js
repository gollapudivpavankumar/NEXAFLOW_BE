/**
 * GetStream.io Video Service
 *
 * Server-side wrapper for GetStream Video API.
 * Uses hardcoded Stream API credentials.
 */

import { StreamClient } from '@stream-io/node-sdk';

const STREAM_API_KEY = 'gba97tc7jvrd';
const STREAM_API_SECRET = 'tdjcj2r2ffek9mcgmfwhntnxfy6nepjjct2y3dwupv79zhwv3w8z23sn4ua4ycky';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);
  }
  return _client;
}

export function isConfigured() {
  return !!STREAM_API_KEY && !!STREAM_API_SECRET;
}

export function getApiKey() {
  return STREAM_API_KEY;
}

/**
 * Ensure a user exists on GetStream. Call this before creating calls/tokens.
 */
export async function upsertUser(userId, name, role) {
  const client = getClient();
  await client.upsertUsers([{
    id: userId.toString(),
    name: name || userId.toString(),
    role: role || 'user'
  }]);
}

/**
 * Create or get a video call.
 */
export async function createCall(callId, creatorId, memberIds = [], callType = 'default') {
  const client = getClient();

  // Ensure all users exist on Stream
  const allUserIds = [creatorId, ...memberIds];
  await client.upsertUsers(allUserIds.map(id => ({
    id: id.toString(),
    role: 'user'
  })));

  const call = client.video.call(callType, callId);
  const response = await call.getOrCreate({
    data: {
      created_by_id: creatorId.toString(),
      members: allUserIds.map(id => ({ user_id: id.toString() }))
    }
  });

  return {
    callId,
    callType,
    call: response
  };
}

/**
 * Generate a user token for joining a call.
 */
export function generateUserToken(userId) {
  const client = getClient();
  return client.generateUserToken({ user_id: userId.toString() });
}

/**
 * End a call.
 */
export async function endCall(callId, callType = 'default') {
  try {
    const client = getClient();
    const call = client.video.call(callType, callId);
    await call.end();
    return { ended: true, callId };
  } catch (error) {
    console.error('Failed to end Stream call:', error.message);
    return { ended: false, callId, error: error.message };
  }
}
