'use strict';

jest.mock('../../src/config/prisma', () => ({
  event: { count: jest.fn(), findMany: jest.fn() },
  certificate: { count: jest.fn(), groupBy: jest.fn() },
  blockchainTransaction: { findMany: jest.fn() },
}));

const prisma = require('../../src/config/prisma');
const dashboardService = require('../../src/modules/dashboard/dashboard.service');

describe('Dashboard service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.event.count.mockResolvedValue(3);
    prisma.certificate.count.mockResolvedValue(12);
    prisma.certificate.groupBy
      .mockResolvedValueOnce([{ status: 'CONFIRMED', _count: { _all: 10 } }, { status: 'FAILED', _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ eventId: 'event-1', _count: { _all: 12 } }]);
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1', name: 'Hackathon' }]);
    prisma.blockchainTransaction.findMany.mockResolvedValue([{ id: 'tx-1', status: 'CONFIRMED' }]);
  });

  it('returns administrator-wide issuance and transaction metrics', async () => {
    const result = await dashboardService.getStats({ id: 'admin-1', role: 'ADMIN' });

    expect(result.totalEvents).toBe(3);
    expect(result.totalCertificates).toBe(12);
    expect(result.statusCounts).toEqual({ CONFIRMED: 10, FAILED: 2 });
    expect(result.eventDistribution).toEqual([{ eventId: 'event-1', eventName: 'Hackathon', certificates: 12 }]);
    expect(result.recentTransactions).toEqual([{ id: 'tx-1', status: 'CONFIRMED' }]);
    expect(prisma.event.count).toHaveBeenCalledWith({ where: {} });
  });

  it('scopes organizer metrics to managed events', async () => {
    await dashboardService.getStats({ id: 'teacher-1', role: 'TEACHER' });

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { OR: [{ createdById: 'teacher-1' }, { issuerId: 'teacher-1' }] },
    });
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: { event: { OR: [{ createdById: 'teacher-1' }, { issuerId: 'teacher-1' }] } },
    });
  });
});
