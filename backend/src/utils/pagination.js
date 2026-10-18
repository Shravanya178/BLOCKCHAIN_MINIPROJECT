'use strict';

const { z } = require('zod');

/** Parses ?page=&pageSize= into Prisma skip/take with sane bounds. */
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function toPrisma({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

function meta({ page, pageSize }, total) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

module.exports = { paginationSchema, toPrisma, meta };
