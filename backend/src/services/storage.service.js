'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

/**
 * Storage abstraction. Callers only use opaque keys like
 * "certificates/<eventId>/<certificateId>.pdf", so the local driver can later
 * be swapped for S3/GCS/Azure without touching business logic.
 */
class LocalStorage {
  constructor(rootDir) {
    this.root = path.resolve(rootDir);
  }

  resolve(key) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9._\-/]+$/.test(key) || key.includes('..')) {
      throw new Error('Invalid storage key');
    }
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  /** Atomic write: temp file then rename, so readers never see partial files. */
  async save(key, buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmp, buffer, { flag: 'wx' });
    await fs.rename(tmp, full);
    return { key, size: buffer.length };
  }

  async read(key) {
    return fs.readFile(this.resolve(key));
  }

  async exists(key) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

function createStorage() {
  switch (config.storage.driver) {
    case 'local':
    default:
      return new LocalStorage(config.storage.dir);
  }
}

module.exports = createStorage();
module.exports.LocalStorage = LocalStorage;
