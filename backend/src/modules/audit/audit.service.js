'use strict';

const prisma = require('../../config/prisma');
const logger = require('../../utils/logger');
const { toPrisma, meta } = require('../../utils/pagination');

/**
 * Records an audit entry. Audit failures are logged but never break the
 * business operation that triggered them. Do not put personal data in metadata.
 */
async function record({ actorId = null, action, entityType, entityId = null, metadata = undefined, ip = null }) {
  try {
    await prisma.auditLog.create({
      data: { actorId, action, entityType, entityId: entityId ? String(entityId) : null, metadata, ipAddress: ip },
    });
  } catch (err) {
    logger.error('Failed to write audit log', { err, action, entityType });
  }
}

async function list(query) {
  const where = {};
  if (query.action) where.action = query.action;
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.actorId) where.actorId = query.actorId;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toPrisma(query),
      include: { actor: { select: { id: true, name: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, meta: meta(query, total) };
}

module.exports = { record, list };
