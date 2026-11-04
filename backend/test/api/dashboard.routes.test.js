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

jest.mock('../../src/modules/dashboard/dashboard.service', () => ({
  getStats: jest.fn().mockResolvedValue({ totalEvents: 1, totalCertificates: 2 }),
}));

const express = require('express');
const request = require('supertest');
const dashboardRoutes = require('../../src/modules/dashboard/dashboard.routes');
const dashboardService = require('../../src/modules/dashboard/dashboard.service');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use('/dashboard', dashboardRoutes);
app.use(errorHandler);

describe('Dashboard routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['ADMIN', 'TEACHER'])('allows %s users to read dashboard metrics', async (role) => {
    const response = await request(app).get('/dashboard/stats').set('x-test-role', role);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ totalEvents: 1, totalCertificates: 2 });
    expect(dashboardService.getStats).toHaveBeenCalledWith({ id: 'user-id', role });
  });

  it('rejects unauthenticated users', async () => {
    const response = await request(app).get('/dashboard/stats');
    expect(response.status).toBe(401);
    expect(dashboardService.getStats).not.toHaveBeenCalled();
  });

  it('rejects unsupported roles', async () => {
    const response = await request(app).get('/dashboard/stats').set('x-test-role', 'STUDENT');
    expect(response.status).toBe(403);
  });
});
