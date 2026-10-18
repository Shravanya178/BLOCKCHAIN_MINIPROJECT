'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

/**
 * Verifies the Bearer access token and loads the current (active) user.
 * The user is re-read from the DB so deactivation/role changes take effect
 * immediately rather than when the token expires.
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw AppError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
    } catch (err) {
      throw AppError.unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
    }
    if (payload.type !== 'access') throw AppError.unauthorized('Invalid access token');

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, name: true, role: true, designation: true,
        canCreateEvents: true, canRevoke: true, isActive: true,
      },
    });
    if (!user || !user.isActive) throw AppError.unauthorized('Account is inactive or does not exist');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Restricts a route to the given roles. */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) return next(AppError.forbidden());
  return next();
};

/** Permission checks shared by middleware and services. */
const permissions = {
  canCreateEvents: (user) => user.role === 'ADMIN' || (user.role === 'TEACHER' && user.canCreateEvents),
  canRevoke: (user) => user.role === 'ADMIN' || (user.role === 'TEACHER' && user.canRevoke),
  canIssueForEvent: (user, event) =>
    user.role === 'ADMIN' || event.createdById === user.id || event.issuerId === user.id,
  canManageEvent: (user, event) => user.role === 'ADMIN' || event.createdById === user.id,
};

const requirePermission = (name) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!permissions[name](req.user)) return next(AppError.forbidden());
  return next();
};

module.exports = { authenticate, requireRole, requirePermission, permissions };
