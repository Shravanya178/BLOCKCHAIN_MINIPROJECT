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

class PinataStorage {
  constructor(rootDir) {
    this.localCache = new LocalStorage(rootDir);
    this.pinata = require('./pinata.service');
  }

  /**
   * Saves to local disk cache AND pins to IPFS via Pinata.
   */
  async save(key, buffer) {
    // 1. Keep a local file cache
    await this.localCache.save(key, buffer);

    // 2. Upload to Pinata IPFS
    const fileName = path.basename(key);
    const result = await this.pinata.uploadFile(buffer, fileName, { storageKey: key });

    return {
      key: `ipfs://${result.ipfsHash}`,
      ipfsHash: result.ipfsHash,
      ipfsUrl: result.ipfsUrl,
      size: buffer.length,
    };
  }

  async read(key) {
    // If it's a local key or cached locally
    if (await this.localCache.exists(key)) {
      return this.localCache.read(key);
    }

    const ipfsHash = key.replace(/^ipfs:\/\//, '');
    const url = this.pinata.getGatewayUrl(ipfsHash);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch from IPFS gateway (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async exists(key) {
    if (await this.localCache.exists(key)) return true;
    try {
      const ipfsHash = key.replace(/^ipfs:\/\//, '');
      const url = this.pinata.getGatewayUrl(ipfsHash);
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async remove(key) {
    if (await this.localCache.exists(key)) {
      await this.localCache.remove(key);
    }
    const ipfsHash = key.replace(/^ipfs:\/\//, '');
    await this.pinata.unpin(ipfsHash);
  }
}

function createStorage() {
  switch (config.storage.driver) {
    case 'pinata':
      return new PinataStorage(config.storage.dir);
    case 'local':
    default:
      return new LocalStorage(config.storage.dir);
  }
}

module.exports = createStorage();
module.exports.LocalStorage = LocalStorage;
module.exports.PinataStorage = PinataStorage;
