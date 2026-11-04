const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const HASH_A = `0x${'ab'.repeat(32)}`;
const HASH_B = `0x${'cd'.repeat(32)}`;
const ID = 'CERT-TEST00000001';
const EXPIRING_ID = 'CERT-EXPIRING000001';

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

    it('supports separate administrator, deployer issuer, and additional issuer wallets', async () => {
      const [admin, deployerIssuer, additionalIssuer, stranger] = await ethers.getSigners();
      const Registry = await ethers.getContractFactory('CertificateRegistry');
      const registry = await Registry.deploy(admin.address, deployerIssuer.address);
      await registry.waitForDeployment();

      const adminRole = await registry.DEFAULT_ADMIN_ROLE();
      const issuerRole = await registry.ISSUER_ROLE();
      expect(await registry.hasRole(adminRole, admin.address)).to.equal(true);
      expect(await registry.hasRole(issuerRole, deployerIssuer.address)).to.equal(true);
      expect(await registry.hasRole(issuerRole, additionalIssuer.address)).to.equal(false);

      await expect(registry.connect(stranger).grantRole(issuerRole, additionalIssuer.address))
        .to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount')
        .withArgs(stranger.address, adminRole);
      await registry.connect(admin).grantRole(issuerRole, additionalIssuer.address);
      expect(await registry.hasRole(issuerRole, additionalIssuer.address)).to.equal(true);
    });
  });

  describe('registration', () => {
    it('registers a certificate and emits CertificateRegistered', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      const key = ethers.keccak256(ethers.toUtf8Bytes(ID));
      await expect(registry.connect(issuer).registerCertificate(ID, HASH_A))
        .to.emit(registry, 'CertificateRegistered')
        .withArgs(key, ID, HASH_A, issuer.address, anyValue, 0);

      const rec = await registry.getCertificate(ID);
      expect(rec.exists).to.equal(true);
      expect(rec.documentHash).to.equal(HASH_A);
      expect(rec.issuer).to.equal(issuer.address);
      expect(rec.issuedAt).to.be.greaterThan(0n);
      expect(rec.revoked).to.equal(false);
      expect(rec.validUntil).to.equal(0n);
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

    it('registers expiring certificates and rejects expired verification', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      const latest = await ethers.provider.getBlock('latest');
      const validUntil = BigInt(latest.timestamp + 3600);

      await expect(registry.connect(issuer).registerCertificateWithExpiry(EXPIRING_ID, HASH_A, validUntil))
        .to.emit(registry, 'CertificateRegistered')
        .withArgs(
          ethers.keccak256(ethers.toUtf8Bytes(EXPIRING_ID)),
          EXPIRING_ID,
          HASH_A,
          issuer.address,
          anyValue,
          validUntil,
        );

      const rec = await registry.getCertificate(EXPIRING_ID);
      expect(rec.validUntil).to.equal(validUntil);
      expect(await registry.isCertificateExpired(EXPIRING_ID)).to.equal(false);
      expect((await registry.verifyCertificate(EXPIRING_ID, HASH_A)).valid).to.equal(true);

      await ethers.provider.send('evm_setNextBlockTimestamp', [Number(validUntil)]);
      await ethers.provider.send('evm_mine');

      const verification = await registry.verifyCertificate(EXPIRING_ID, HASH_A);
      expect(verification.valid).to.equal(false);
      expect(verification.expired).to.equal(true);
      expect(await registry.isCertificateExpired(EXPIRING_ID)).to.equal(true);
    });

    it('rejects expiry timestamps in the past or at the current block time', async () => {
      const { registry, issuer } = await loadFixture(deployFixture);
      const latest = await ethers.provider.getBlock('latest');

      await expect(
        registry.connect(issuer).registerCertificateWithExpiry(EXPIRING_ID, HASH_A, latest.timestamp),
      ).to.be.revertedWithCustomError(registry, 'ExpiryMustBeInTheFuture');
    });

    it('rejects zero constructor addresses', async () => {
      const Registry = await ethers.getContractFactory('CertificateRegistry');
      await expect(Registry.deploy(ethers.ZeroAddress, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(Registry, 'InvalidAdmin');
      await expect(Registry.deploy((await ethers.getSigners())[0].address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(Registry, 'InvalidIssuer');
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
