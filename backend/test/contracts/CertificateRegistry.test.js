const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const HASH_A = `0x${'ab'.repeat(32)}`;
const HASH_B = `0x${'cd'.repeat(32)}`;
const ID = 'CERT-TEST00000001';

describe('CertificateRegistry', () => {
  async function deployFixture() {
    const [admin, issuer, otherIssuer, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('CertificateRegistry');
    const registry = await Registry.deploy(admin.address, issuer.address);
    await registry.waitForDeployment();
    const ISSUER_ROLE = await registry.ISSUER_ROLE();
    await registry.connect(admin).grantRole(ISSUER_ROLE, otherIssuer.address);
    return { registry, admin, issuer, otherIssuer, stranger, ISSUER_ROLE };
  }

  describe('deployment', () => {
    it('assigns admin and issuer roles explicitly', async () => {
      const { registry, admin, issuer, stranger, ISSUER_ROLE } = await loadFixture(deployFixture);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await registry.hasRole(ISSUER_ROLE, issuer.address)).to.equal(true);
      expect(await registry.hasRole(ISSUER_ROLE, admin.address)).to.equal(false);
      expect(await registry.hasRole(ISSUER_ROLE, stranger.address)).to.equal(false);
    });
  });

  describe('registration', () => {
    it('registers a certificate and emits CertificateRegistered', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      const key = ethers.keccak256(ethers.toUtf8Bytes(ID));
      await expect(registry.connect(issuer).registerCertificate(ID, HASH_A))
        .to.emit(registry, 'CertificateRegistered')
        .withArgs(key, ID, HASH_A, issuer.address, anyValue);

      const rec = await registry.getCertificate(ID);
      expect(rec.exists).to.equal(true);
      expect(rec.documentHash).to.equal(HASH_A);
      expect(rec.issuer).to.equal(issuer.address);
      expect(rec.issuedAt).to.be.greaterThan(0n);
      expect(rec.revoked).to.equal(false);
      expect(await registry.certificateExists(ID)).to.equal(true);
      expect(await registry.totalCertificates()).to.equal(1n);
      expect(await registry.certificateKey(ID)).to.equal(key);
    });

    it('rejects duplicate registration of the same certificate ID', async () => {
      const { registry, issuer, otherIssuer } = await loadFixture(deployFixture);
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      await expect(registry.connect(issuer).registerCertificate(ID, HASH_B))
        .to.be.revertedWithCustomError(registry, 'CertificateAlreadyExists')
        .withArgs(ID);
      await expect(registry.connect(otherIssuer).registerCertificate(ID, HASH_A))
        .to.be.revertedWithCustomError(registry, 'CertificateAlreadyExists');
      expect((await registry.getCertificate(ID)).documentHash).to.equal(HASH_A);
    });

    it('rejects registration by accounts without ISSUER_ROLE (including admin)', async () => {
      const { registry, admin, stranger, ISSUER_ROLE } = await loadFixture(deployFixture);
      await expect(registry.connect(stranger).registerCertificate(ID, HASH_A))
        .to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount')
        .withArgs(stranger.address, ISSUER_ROLE);
      await expect(registry.connect(admin).registerCertificate(ID, HASH_A))
        .to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount');
    });

    it('validates the certificate ID and hash', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      await expect(registry.connect(issuer).registerCertificate('', HASH_A)).to.be.revertedWithCustomError(registry, 'EmptyCertificateId');
      await expect(registry.connect(issuer).registerCertificate('X'.repeat(65), HASH_A)).to.be.revertedWithCustomError(registry, 'CertificateIdTooLong');
      await expect(registry.connect(issuer).registerCertificate(ID, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, 'InvalidDocumentHash');
    });

    it('prevents a revoked issuer from registering', async () => {
      const { registry, admin, issuer, ISSUER_ROLE } = await loadFixture(deployFixture);
      await registry.connect(admin).revokeRole(ISSUER_ROLE, issuer.address);
      await expect(registry.connect(issuer).registerCertificate(ID, HASH_A)).to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount');
    });
  });

  describe('lookups', () => {
    it('returns exists=false for unknown IDs without reverting', async () => {
      const { registry } = await loadFixture(deployFixture);
      const rec = await registry.getCertificate('CERT-UNKNOWN');
      expect(rec.exists).to.equal(false);
      expect(rec.documentHash).to.equal(ethers.ZeroHash);
      expect(await registry.certificateExists('CERT-UNKNOWN')).to.equal(false);
    });

    it('verifyCertificate checks hash and revocation', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      expect((await registry.verifyCertificate(ID, HASH_A)).valid).to.equal(true);
      expect((await registry.verifyCertificate(ID, HASH_B)).valid).to.equal(false);
      expect((await registry.verifyCertificate('CERT-NOPE', HASH_A)).valid).to.equal(false);
    });
  });

  describe('revocation', () => {
    it('lets the original issuer revoke and emits CertificateRevoked', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      await expect(registry.connect(issuer).revokeCertificate(ID))
        .to.emit(registry, 'CertificateRevoked')
        .withArgs(ethers.keccak256(ethers.toUtf8Bytes(ID)), ID, issuer.address, anyValue);
      const rec = await registry.getCertificate(ID);
      expect(rec.revoked).to.equal(true);
      expect(rec.revokedAt).to.be.greaterThan(0n);
      const v = await registry.verifyCertificate(ID, HASH_A);
      expect(v.valid).to.equal(false);
      expect(v.revoked).to.equal(true);
    });

    it('lets an admin revoke any certificate', async () => {
      const { registry, admin, issuer } = await loadFixture(deployFixture);
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      await expect(registry.connect(admin).revokeCertificate(ID)).to.emit(registry, 'CertificateRevoked');
    });

    it('rejects revocation by strangers and by other issuers', async () => {
      const { registry, issuer, otherIssuer, stranger } = await loadFixture(deployFixture);
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      await expect(registry.connect(stranger).revokeCertificate(ID))
        .to.be.revertedWithCustomError(registry, 'NotAuthorizedToRevoke')
        .withArgs(ID, stranger.address);
      await expect(registry.connect(otherIssuer).revokeCertificate(ID)).to.be.revertedWithCustomError(registry, 'NotAuthorizedToRevoke');
    });

    it('rejects revoking unknown or already revoked certificates', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      await expect(registry.connect(issuer).revokeCertificate('CERT-UNKNOWN'))
        .to.be.revertedWithCustomError(registry, 'CertificateNotFound')
        .withArgs('CERT-UNKNOWN');
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      await registry.connect(issuer).revokeCertificate(ID);
      await expect(registry.connect(issuer).revokeCertificate(ID)).to.be.revertedWithCustomError(registry, 'CertificateAlreadyRevoked');
    });

    it('does not allow re-registering a revoked certificate ID', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      await registry.connect(issuer).registerCertificate(ID, HASH_A);
      await registry.connect(issuer).revokeCertificate(ID);
      await expect(registry.connect(issuer).registerCertificate(ID, HASH_B)).to.be.revertedWithCustomError(registry, 'CertificateAlreadyExists');
    });
  });
});
