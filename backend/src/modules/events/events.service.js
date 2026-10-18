'use strict';

const prisma = require('../../config/prisma');
const config = require('../../config');
const AppError = require('../../utils/AppError');
const { isUuid, formatDateOnly } = require('../../validators/common');
const { toPrisma, meta } = require('../../utils/pagination');
const { permissions } = require('../../middleware/auth');
const audit = require('../audit/audit.service');

const include = {
  createdBy: { select: { id: true, name: true } },
  issuer: { select: { id: true, name: true, designation: true } },
  defaultTemplate: { select: { id: true, key: true, name: true } },
  _count: { select: { certificates: true } },
};

const serialize = (e) => ({
  ...e,
  eventDate: formatDateOnly(e.eventDate),
  endDate: formatDateOnly(e.endDate),
});

async function getEventOrThrow(eventId) {
  if (!isUuid(eventId)) throw AppError.notFound('Event not found');
  const event = await prisma.event.findUnique({ where: { id: eventId }, include });
  if (!event) throw AppError.notFound('Event not found');
  return event;
}

async function resolveIssuer(user, issuerId) {
  if (!issuerId || issuerId === user.id) return user.id;
  // Only admins may assign another user as the authorized issuer.
  if (user.role !== 'ADMIN') throw AppError.forbidden('Only administrators can assign a different issuer');
  const issuer = await prisma.user.findUnique({ where: { id: issuerId } });
  if (!issuer || !issuer.isActive) throw AppError.validation('issuerId does not reference an active user');
  return issuer.id;
}

async function assertTemplate(templateId) {
  if (!templateId) return;
  const t = await prisma.certificateTemplate.findUnique({ where: { id: templateId } });
  if (!t || !t.isActive) throw AppError.validation('defaultTemplateId does not reference an active template');
}

async function createEvent(user, data, ip) {
  if (!permissions.canCreateEvents(user)) throw AppError.forbidden('You are not permitted to create events');
  const issuerId = await resolveIssuer(user, data.issuerId);
  await assertTemplate(data.defaultTemplateId);

  const event = await prisma.event.create({
    data: {
      ...data,
      institutionName: data.institutionName || config.institutionName,
      status: data.status || 'ACTIVE',
      createdById: user.id,
      issuerId,
    },
    include,
  });
  await audit.record({ actorId: user.id, action: 'EVENT_CREATED', entityType: 'Event', entityId: event.id, ip });
  return serialize(event);
}

async function listEvents(user, q) {
  const where = {};
  if (q.status) where.status = q.status;
  else where.status = { not: 'ARCHIVED' };
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { organizingBody: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  if (q.from || q.to) where.eventDate = { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) };
  // Teachers only see events they created or are the authorized issuer for.
  if (user.role !== 'ADMIN' || q.mine === 'true') {
    where.AND = [{ OR: [{ createdById: user.id }, { issuerId: user.id }] }];
  }

  const [items, total] = await Promise.all([
    prisma.event.findMany({ where, include, orderBy: { eventDate: 'desc' }, ...toPrisma(q) }),
    prisma.event.count({ where }),
  ]);
  return { items: items.map(serialize), meta: meta(q, total) };
}

async function getEvent(user, eventId) {
  const event = await getEventOrThrow(eventId);
  if (!permissions.canIssueForEvent(user, event)) throw AppError.forbidden('You do not have access to this event');
  const statusCounts = await prisma.certificate.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } });
  return {
    ...serialize(event),
    certificateStats: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
  };
}

async function updateEvent(user, eventId, data, ip) {
  const event = await getEventOrThrow(eventId);
  if (!permissions.canManageEvent(user, event)) throw AppError.forbidden('Only the event creator or an admin can update this event');
  if (event.status === 'ARCHIVED') throw AppError.conflict('Archived events cannot be modified');

  const patch = { ...data };
  if (data.issuerId !== undefined) patch.issuerId = await resolveIssuer(user, data.issuerId);
  if (data.defaultTemplateId) await assertTemplate(data.defaultTemplateId);
  const eventDate = patch.eventDate || event.eventDate;
  const endDate = patch.endDate === undefined ? event.endDate : patch.endDate;
  if (endDate && endDate < eventDate) throw AppError.validation('endDate cannot be before eventDate');

  const updated = await prisma.event.update({ where: { id: eventId }, data: patch, include });
  await audit.record({ actorId: user.id, action: 'EVENT_UPDATED', entityType: 'Event', entityId: eventId, metadata: { fields: Object.keys(data) }, ip });
  return serialize(updated);
}

async function archiveEvent(user, eventId, ip) {
  const event = await getEventOrThrow(eventId);
  if (!permissions.canManageEvent(user, event)) throw AppError.forbidden('Only the event creator or an admin can archive this event');
  if (event.status === 'ARCHIVED') return serialize(event);
  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
    include,
  });
  await audit.record({ actorId: user.id, action: 'EVENT_ARCHIVED', entityType: 'Event', entityId: eventId, ip });
  return serialize(updated);
}

module.exports = { createEvent, listEvents, getEvent, updateEvent, archiveEvent, getEventOrThrow };
