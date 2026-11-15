'use strict';

const { createHash, randomBytes } = require('crypto');
const https = require('https');
const os = require('os');

function request(ipAddress, path, form) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://${ipAddress}:8443${path}`, {
      method: form ? 'POST' : 'GET',
      rejectUnauthorized: false,
      headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    }, res => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error('DIRIGERA returned an invalid authentication response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('DIRIGERA authentication timed out')));
    req.end(form);
  });
}

async function startAuthentication(ipAddress) {
  const verifier = randomBytes(48).toString('base64url');
  const query = new URLSearchParams({
    audience: 'homesmart.local',
    response_type: 'code',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  const result = await request(ipAddress, `/v1/oauth/authorize?${query}`);
  if (!result.code) throw new Error(result.error || 'DIRIGERA did not return an authorization code');
  return { code: result.code, verifier };
}

async function getAccessToken(ipAddress, { code, verifier }) {
  const form = new URLSearchParams({
    code,
    name: os.hostname(),
    grant_type: 'authorization_code',
    code_verifier: verifier,
  }).toString();
  const result = await request(ipAddress, '/v1/oauth/token', form);
  if (result.access_token) return result.access_token;
  if (result.error === 'Button not pressed or presence time stamp timed out.') return null;
  throw new Error(result.error || 'DIRIGERA did not return an access token');
}

module.exports = { startAuthentication, getAccessToken };
