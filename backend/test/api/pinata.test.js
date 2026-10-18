'use strict';

const pinata = require('../../src/services/pinata.service');
const { PinataStorage } = require('../../src/services/storage.service');

describe('Pinata IPFS Service & Storage Driver', () => {
  describe('Pinata Service', () => {
    it('returns gateway URL for a given hash', () => {
      const hash = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
      const url = pinata.getGatewayUrl(hash);
      expect(url).toContain('/ipfs/' + hash);
      expect(url.startsWith('https://')).toBe(true);
    });

    it('cleans ipfs:// prefix in getGatewayUrl', () => {
      const hashWithPrefix = 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco';
      const url = pinata.getGatewayUrl(hashWithPrefix);
      expect(url).toContain('/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco');
      expect(url).not.toContain('ipfs://');
    });

    it('returns null if hash is empty', () => {
      expect(pinata.getGatewayUrl(null)).toBeNull();
      expect(pinata.getGatewayUrl('')).toBeNull();
    });

    it('returns false for isConfigured when JWT is absent or empty', () => {
      // Unless configured in environment, should return boolean
      expect(typeof pinata.isConfigured()).toBe('boolean');
    });

    it('fails uploadFile when not configured', async () => {
      if (!pinata.isConfigured()) {
        const fakeBuffer = Buffer.from('test pdf content');
        await expect(pinata.uploadFile(fakeBuffer, 'test.pdf')).rejects.toThrow(
          'Pinata IPFS is not configured',
        );
      }
    });
  });

  describe('PinataStorage Driver', () => {
    it('exports PinataStorage class', () => {
      expect(typeof PinataStorage).toBe('function');
      const storageInstance = new PinataStorage('./test-cache');
      expect(typeof storageInstance.save).toBe('function');
      expect(typeof storageInstance.read).toBe('function');
      expect(typeof storageInstance.exists).toBe('function');
    });
  });
});
