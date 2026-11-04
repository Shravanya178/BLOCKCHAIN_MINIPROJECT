'use strict';

jest.mock('../../src/config/prisma', () => ({
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
}));

const prisma = require('../../src/config/prisma');
const logger = require('../../src/utils/logger');
const auditService = require('../../src/modules/audit/audit.service');

describe('Audit service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records an audit entry with normalized entity identifiers', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await auditService.record({
      actorId: 'user-1',
      action: 'CERTIFICATE_ISSUED',
      entityType: 'CERTIFICATE',
      entityId: 123,
      metadata: { status: 'CONFIRMED' },
      ip: '127.0.0.1',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'CERTIFICATE_ISSUED',
        entityType: 'CERTIFICATE',
        entityId: '123',
        metadata: { status: 'CONFIRMED' },
        ipAddress: '127.0.0.1',
      },
    });
  });

  it('does not break the business operation when audit persistence fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('database unavailable'));

    await expect(auditService.record({
      action: 'CERTIFICATE_REVOKED',
      entityType: 'CERTIFICATE',
    })).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to write audit log',
      expect.objectContaining({
        action: 'CERTIFICATE_REVOKED',
        entityType: 'CERTIFICATE',
      }),
    );
  });

  it('lists audit entries with supported filters and pagination', async () => {
    prisma.auditLog.findMany.mockResolvedValue([{ id: 'audit-1' }]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await auditService.list({
      action: 'CERTIFICATE_ISSUED',
      entityType: 'CERTIFICATE',
      entityId: '123',
      actorId: 'user-1',
      page: 2,
      limit: 10,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        action: 'CERTIFICATE_ISSUED',
        entityType: 'CERTIFICATE',
        entityId: '123',
        actorId: 'user-1',
      },
      orderBy: { createdAt: 'desc' },
    }));
    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: {
        action: 'CERTIFICATE_ISSUED',
        entityType: 'CERTIFICATE',
        entityId: '123',
        actorId: 'user-1',
      },
    });
    expect(result.items).toEqual([{ id: 'audit-1' }]);
    expect(result.meta.total).toBe(1);
  });
});
