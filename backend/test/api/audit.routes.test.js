'use strict';

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return next(require('../../src/utils/AppError').unauthorized());
    req.user = { id: 'user-id', role };
    return next();
  },
  requireRole: (...roles) => (req, _res, next) => (
    roles.includes(req.user?.role)
      ? next()
      : next(require('../../src/utils/AppError').forbidden())
  ),
}));

jest.mock('../../src/modules/audit/audit.service', () => ({
  list: jest.fn().mockResolvedValue({
    items: [{ id: 'audit-1', action: 'CERTIFICATE_ISSUED' }],
    meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  }),
}));

const express = require('express');
const request = require('supertest');
const auditRoutes = require('../../src/modules/audit/audit.routes');
const auditService = require('../../src/modules/audit/audit.service');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use('/audit', auditRoutes);
app.use(errorHandler);

describe('Audit routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['ADMIN', 'TEACHER'])('allows %s users to query audit records', async (role) => {
    const response = await request(app)
      .get('/audit?action=CERTIFICATE_ISSUED&page=1&pageSize=10')
      .set('x-test-role', role);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(auditService.list).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CERTIFICATE_ISSUED',
      page: 1,
      pageSize: 10,
    }));
  });

  it('rejects unauthenticated users', async () => {
    const response = await request(app).get('/audit');

    expect(response.status).toBe(401);
    expect(auditService.list).not.toHaveBeenCalled();
  });

  it('rejects roles outside the audit policy', async () => {
    const response = await request(app)
      .get('/audit')
      .set('x-test-role', 'STUDENT');

    expect(response.status).toBe(403);
    expect(auditService.list).not.toHaveBeenCalled();
  });
});
