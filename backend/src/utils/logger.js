'use strict';

/**
 * Minimal structured logger. Keys that may hold secrets or personal data are
 * redacted before anything is written.
 */
const REDACT = /pass(word)?|secret|token|authorization|private.?key|cookie|email|phone|mnemonic/i;

function redact(value, depth = 0) {
  if (value === null || value === undefined || depth > 5) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACT.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = levels[process.env.LOG_LEVEL] || (process.env.NODE_ENV === 'test' ? levels.error : levels.info);

function write(level, message, meta) {
  if (levels[level] < minLevel) return;
  const line = { time: new Date().toISOString(), level, message, ...(meta ? redact(meta) : {}) };
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

module.exports = {
  debug: (m, meta) => write('debug', m, meta),
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
  redact,
};
