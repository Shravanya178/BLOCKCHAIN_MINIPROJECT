'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');

const BCRYPT_ROUNDS = 12;
// Pre-computed hash used to keep login timing similar for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 10);

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  designation: u.designation,
  canCreateEvents: u.canCreateEvents,
  canRevoke: u.canRevoke,
  isActive: u.isActive,
});

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, config.jwt.accessSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.accessTtl,
  });
}

async function issueRefreshToken(userId) {
  // Opaque random token; only its SHA-256 hash is stored.
  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  return { token, expiresAt };
}

async function buildSession(user) {
  const accessToken = signAccessToken(user);
  const refresh = await issueRefreshToken(user.id);
  return {
    tokenType: 'Bearer',
    accessToken,
    accessTokenExpiresIn: config.jwt.accessTtl,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
    user: publicUser(user),
  };
}

async function login(email, password, ip) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok || !user.isActive) {
    await audit.record({ action: 'AUTH_LOGIN_FAILED', entityType: 'User', entityId: user?.id, ip });
    throw AppError.unauthorized('Invalid email or password');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit.record({ actorId: user.id, action: 'AUTH_LOGIN', entityType: 'User', entityId: user.id, ip });
  return buildSession(user);
}

/** Rotates a refresh token: the old one is revoked and a new pair is issued. */
async function refresh(refreshToken) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date() || !record.user.isActive) {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
  // Atomic revoke guards against concurrent reuse of the same token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count !== 1) throw AppError.unauthorized('Invalid or expired refresh token');
  return buildSession(record.user);
}

async function logout(refreshToken) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = { login, refresh, logout, hashPassword, publicUser, signAccessToken };
