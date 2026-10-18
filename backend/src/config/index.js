'use strict';

const path = require('path');
const { z } = require('zod');

// Load backend/.env regardless of the current working directory.
// Existing process.env values (e.g. set by tests) take precedence.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const int = (def) => z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(def));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  VERIFICATION_URL_BASE: z.preprocess(emptyToUndefined, z.string().url().optional()),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: int(7),

  BLOCKCHAIN_NETWORK: z.string().default('localhost'),
  BLOCKCHAIN_RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  CHAIN_ID: int(31337),
  BLOCKCHAIN_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'BLOCKCHAIN_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key'),
  CONTRACT_ADDRESS: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'CONTRACT_ADDRESS must be an address').optional(),
  ),
  TX_CONFIRMATIONS: int(1),
  TX_TIMEOUT_MS: int(60000),
  RPC_TIMEOUT_MS: int(10000),

  STORAGE_DRIVER: z.enum(['local', 'pinata']).default('local'),
  STORAGE_DIR: z.string().default('./generated/certificates'),
  PINATA_JWT: optionalString,
  PINATA_GATEWAY: z.string().default('gateway.pinata.cloud'),
  MAX_CSV_SIZE_BYTES: int(1024 * 1024),
  MAX_CSV_ROWS: int(200),
  MAX_PDF_UPLOAD_BYTES: int(5 * 1024 * 1024),
  INSTITUTION_NAME: z.string().default('Institute of Engineering and Technology'),
  DEPLOYMENTS_DIR: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Do not print values: they may contain secrets.
  console.error(`Invalid environment configuration:\n${issues}\nSee backend/.env.example.`);
  process.exit(1);
}

const env = parsed.data;
const backendRoot = path.resolve(__dirname, '../..');
const apiPrefix = '/api/v1';

const config = {
  env: env.NODE_ENV,
  isTest: env.NODE_ENV === 'test',
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  apiPrefix,
  publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  verificationUrlBase: (env.VERIFICATION_URL_BASE || `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}${apiPrefix}/verify`).replace(/\/+$/, ''),
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  institutionName: env.INSTITUTION_NAME,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
  },
  blockchain: {
    network: env.BLOCKCHAIN_NETWORK,
    rpcUrl: env.BLOCKCHAIN_RPC_URL,
    chainId: env.CHAIN_ID,
    privateKey: env.BLOCKCHAIN_PRIVATE_KEY,
    contractAddress: env.CONTRACT_ADDRESS,
    confirmations: env.TX_CONFIRMATIONS,
    txTimeoutMs: env.TX_TIMEOUT_MS,
    rpcTimeoutMs: env.RPC_TIMEOUT_MS,
    deploymentsDir: path.resolve(backendRoot, env.DEPLOYMENTS_DIR || 'deployments'),
  },
  storage: {
    driver: env.STORAGE_DRIVER,
    dir: path.resolve(backendRoot, env.STORAGE_DIR),
  },
  pinata: {
    jwt: env.PINATA_JWT,
    gateway: env.PINATA_GATEWAY,
  },
  limits: {
    csvBytes: env.MAX_CSV_SIZE_BYTES,
    csvRows: env.MAX_CSV_ROWS,
    pdfUploadBytes: env.MAX_PDF_UPLOAD_BYTES,
    jsonBody: '100kb',
  },
  backendRoot,
};

// Never allow the private key to be serialized accidentally.
Object.defineProperty(config.blockchain, 'privateKey', { enumerable: false });

module.exports = config;
