'use strict';

const config = require('../config');
const logger = require('../utils/logger');

/**
 * Service to interact with Pinata IPFS.
 * Uses native fetch (Node 18+) so no external dependencies are needed.
 */
class PinataService {
  constructor() {
    this.apiUrl = 'https://api.pinata.cloud';
  }

  get jwt() {
    return config.pinata?.jwt;
  }

  get gateway() {
    const raw = config.pinata?.gateway || 'gateway.pinata.cloud';
    return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  /**
   * Check whether Pinata credentials are configured.
   */
  isConfigured() {
    return Boolean(this.jwt && this.jwt.trim().length > 0);
  }

  /**
   * Builds an HTTP gateway URL for a given IPFS CID.
   * @param {string} ipfsHash - IPFS CID or ipfs:// URI
   * @returns {string|null} HTTP gateway URL
   */
  getGatewayUrl(ipfsHash) {
    if (!ipfsHash) return null;
    const cleanHash = ipfsHash.replace(/^ipfs:\/\//, '');
    return `https://${this.gateway}/ipfs/${cleanHash}`;
  }

  /**
   * Tests whether the provided Pinata JWT is valid.
   * @returns {Promise<{ authenticated: boolean, message?: string, error?: string }>}
   */
  async testAuthentication() {
    if (!this.isConfigured()) {
      return {
        authenticated: false,
        message: 'PINATA_JWT is not configured in environment variables',
      };
    }

    try {
      const response = await fetch(`${this.apiUrl}/data/testAuthentication`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          authenticated: false,
          error: `Authentication failed (status ${response.status}): ${errorText}`,
        };
      }

      const body = await response.json();
      return {
        authenticated: true,
        message: body.message || 'Connected to Pinata successfully',
      };
    } catch (err) {
      logger.error('Pinata testAuthentication failed', { error: err.message });
      return { authenticated: false, error: err.message };
    }
  }

  /**
   * Uploads a Buffer (such as a certificate PDF) to IPFS via Pinata pinFileToIPFS.
   *
   * @param {Buffer} buffer - File contents
   * @param {string} fileName - File name to attach in Pinata dashboard
   * @param {Record<string, any>} [metadata={}] - Custom key-value pairs
   * @returns {Promise<{ ipfsHash: string, ipfsUrl: string, pinSize: number, timestamp: string }>}
   */
  async uploadFile(buffer, fileName, metadata = {}) {
    if (!this.isConfigured()) {
      throw new Error('Pinata IPFS is not configured. Please set PINATA_JWT in .env');
    }

    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/pdf' });
    formData.append('file', blob, fileName);

    const pinataMetadata = {
      name: fileName,
      keyvalues: metadata,
    };
    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));

    const pinataOptions = {
      cidVersion: 1,
    };
    formData.append('pinataOptions', JSON.stringify(pinataOptions));

    const response = await fetch(`${this.apiUrl}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Pinata pinFileToIPFS failed', {
        status: response.status,
        body: errorBody,
        fileName,
      });
      throw new Error(`Pinata upload failed (status ${response.status}): ${errorBody}`);
    }

    const result = await response.json();
    const ipfsHash = result.IpfsHash;

    logger.info('File pinned to IPFS via Pinata', {
      ipfsHash,
      fileName,
      pinSize: result.PinSize,
    });

    return {
      ipfsHash,
      ipfsUrl: this.getGatewayUrl(ipfsHash),
      pinSize: result.PinSize,
      timestamp: result.Timestamp,
    };
  }

  /**
   * Pins JSON metadata to IPFS via Pinata pinJSONToIPFS.
   *
   * @param {object} jsonBody - Metadata object
   * @param {string} name - Name tag
   * @returns {Promise<{ ipfsHash: string, ipfsUrl: string }>}
   */
  async uploadJson(jsonBody, name) {
    if (!this.isConfigured()) {
      throw new Error('Pinata IPFS is not configured. Please set PINATA_JWT in .env');
    }

    const body = {
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name: name || 'metadata.json' },
      pinataContent: jsonBody,
    };

    const response = await fetch(`${this.apiUrl}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.jwt}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Pinata pinJSONToIPFS failed (${response.status}): ${errorBody}`);
    }

    const result = await response.json();
    return {
      ipfsHash: result.IpfsHash,
      ipfsUrl: this.getGatewayUrl(result.IpfsHash),
    };
  }

  /**
   * Unpins a file from Pinata.
   *
   * @param {string} ipfsHash - Hash to unpin
   */
  async unpin(ipfsHash) {
    if (!this.isConfigured() || !ipfsHash) return;
    try {
      const cleanHash = ipfsHash.replace(/^ipfs:\/\//, '');
      const response = await fetch(`${this.apiUrl}/pinning/unpin/${cleanHash}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.warn('Pinata unpin request returned non-200', {
          hash: ipfsHash,
          status: response.status,
          error: errorBody,
        });
      }
    } catch (err) {
      logger.warn('Pinata unpin failed', { hash: ipfsHash, error: err.message });
    }
  }
}

module.exports = new PinataService();
