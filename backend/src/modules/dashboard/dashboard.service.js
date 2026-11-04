'use strict';

const prisma = require('../../config/prisma');

async function getStats(user) {
  const eventScope = user.role === 'ADMIN'
    ? {}
    : { OR: [{ createdById: user.id }, { issuerId: user.id }] };

  const certificateScope = user.role === 'ADMIN'
    ? {}
    : { event: eventScope };

  const [
    totalEvents,
    totalCertificates,
    statusCounts,
    eventDistribution,
    recentTransactions,
  ] = await Promise.all([
    prisma.event.count({ where: eventScope }),
    prisma.certificate.count({ where: certificateScope }),
    prisma.certificate.groupBy({
      by: ['status'],
      where: certificateScope,
      _count: { _all: true },
    }),
    prisma.certificate.groupBy({
      by: ['eventId'],
      where: certificateScope,
      _count: { _all: true },
      orderBy: { _count: { eventId: 'desc' } },
      take: 10,
    }),
    prisma.blockchainTransaction.findMany({
      where: { certificate: certificateScope },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        txHash: true,
        blockNumber: true,
        networkName: true,
        createdAt: true,
        certificate: { select: { certificateId: true, eventId: true } },
      },
    }),
  ]);

  const eventIds = eventDistribution.map((item) => item.eventId);
  const events = eventIds.length
    ? await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, name: true },
    })
    : [];
  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  return {
    totalEvents,
    totalCertificates,
    statusCounts: Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all])),
    eventDistribution: eventDistribution.map((item) => ({
      eventId: item.eventId,
      eventName: eventNames.get(item.eventId) || 'Unknown event',
      certificates: item._count._all,
    })),
    recentTransactions,
  };
}

module.exports = { getStats };
