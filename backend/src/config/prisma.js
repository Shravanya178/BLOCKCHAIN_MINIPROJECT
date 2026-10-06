'use strict';

const { PrismaClient } = require('@prisma/client');

// Single shared Prisma client for the whole process.
const prisma = global.__prisma || new PrismaClient({ log: ['warn', 'error'] });
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
