'use strict';

const crypto = require('crypto');

/**
 * SHA-256 of the exact bytes provided, returned as a 0x-prefixed lowercase
 * hex string (directly usable as a Solidity bytes32).
 */
function sha256Hex(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('sha256Hex expects a Buffer');
  return `0x${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

const isHash = (v) => typeof v === 'string' && /^0x[0-9a-f]{64}$/.test(v);

/** Constant-time comparison of two 0x hashes (case-insensitive). */
function hashesEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { sha256Hex, isHash, hashesEqual };
