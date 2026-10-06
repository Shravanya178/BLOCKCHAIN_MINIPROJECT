'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const prisma = require('./config/prisma');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const blockchainService = require('./modules/blockchain/blockchain.service');

// Routes
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const eventsRoutes = require('./modules/events/events.routes');
const templatesRoutes = require('./modules/templates/templates.routes');
const certificatesRoutes = require('./modules/certificates/certificates.routes');
const verificationRoutes = require('./modules/verification/verification.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const swaggerDocument = require('./swagger.json');

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // allow swagger UI & local rendering
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in development
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }),
);

// Body parsers
app.use(express.json({ limit: config.limits.jsonBody }));
app.use(express.urlencoded({ extended: true, limit: config.limits.jsonBody }));

// General Rate Limiting
app.use(apiLimiter);

// Health check endpoints
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/ready', async (_req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const chainStatus = await blockchainService.isChainReachable();

  const isReady = dbOk;
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'degraded',
    checks: {
      database: dbOk ? 'up' : 'down',
      blockchainRpc: chainStatus.reachable ? 'up' : 'down',
      blockchainDetails: chainStatus,
      contractAddress: blockchainService.resolveContractAddress() || 'not_configured',
    },
  });
});

// Swagger API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount Versioned API Modules
const api = config.apiPrefix;
app.use(`${api}/auth`, authRoutes);
app.use(`${api}/users`, usersRoutes);
app.use(`${api}/events`, eventsRoutes);
app.use(`${api}/templates`, templatesRoutes);
app.use(`${api}/certificates`, certificatesRoutes);
app.use(`${api}/verify`, verificationRoutes);
app.use(`${api}/audit`, auditRoutes);

// Catch 404 & Central Error Handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
