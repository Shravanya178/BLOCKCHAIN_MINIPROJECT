// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CertificateRegistry
 * @notice Records SHA-256 hashes of issued certificate PDFs keyed by a public
 *         certificate ID (e.g. "CERT-7K2M9QX4ABCD"). No personal data is stored.
 *
 * Roles:
 *  - DEFAULT_ADMIN_ROLE: manages roles and may revoke any certificate.
 *  - ISSUER_ROLE:        may register certificates and revoke the ones it issued.
 */
contract CertificateRegistry is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Certificate {
        bytes32 documentHash; // SHA-256 of the finalized PDF bytes
        address issuer;       // wallet that registered it
        uint64 issuedAt;      // block timestamp of registration
        uint64 validUntil;    // 0 means no expiry
        uint64 revokedAt;     // 0 when not revoked
        bool revoked;
        bool exists;
    }

    /// keccak256(bytes(certificateId)) => record
    mapping(bytes32 => Certificate) private _certificates;
    uint256 public totalCertificates;

    error EmptyCertificateId();
    error CertificateIdTooLong();
    error InvalidDocumentHash();
    error CertificateAlreadyExists(string certificateId);
    error CertificateNotFound(string certificateId);
    error CertificateAlreadyRevoked(string certificateId);
    error NotAuthorizedToRevoke(string certificateId, address caller);
    error InvalidAdmin();
    error InvalidIssuer();
    error ExpiryMustBeInTheFuture();

    event CertificateRegistered(
        bytes32 indexed certificateKey,
        string certificateId,
        bytes32 indexed documentHash,
        address indexed issuer,
        uint64 issuedAt,
        uint64 validUntil
    );

    event CertificateRevoked(
        bytes32 indexed certificateKey,
        string certificateId,
        address indexed revokedBy,
        uint64 revokedAt
    );

    /**
     * @param admin  receives DEFAULT_ADMIN_ROLE
     * @param issuer receives ISSUER_ROLE (may equal admin)
     */
    constructor(address admin, address issuer) {
        if (admin == address(0)) revert InvalidAdmin();
        if (issuer == address(0)) revert InvalidIssuer();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, issuer);
    }

    function certificateKey(string calldata certificateId) public pure returns (bytes32) {
        return keccak256(bytes(certificateId));
    }

    function registerCertificate(string calldata certificateId, bytes32 documentHash)
        external
        onlyRole(ISSUER_ROLE)
    {
        _registerCertificate(certificateId, documentHash, 0);
    }

    /**
     * @notice Register a certificate with an optional expiry timestamp.
     * @dev `validUntil` must be a future Unix timestamp. Use the existing
     *      two-argument function for certificates that do not expire.
     */
    function registerCertificateWithExpiry(
        string calldata certificateId,
        bytes32 documentHash,
        uint64 validUntil
    )
        external
        onlyRole(ISSUER_ROLE)
    {
        if (validUntil <= block.timestamp) revert ExpiryMustBeInTheFuture();
        _registerCertificate(certificateId, documentHash, validUntil);
    }

    function _registerCertificate(
        string calldata certificateId,
        bytes32 documentHash,
        uint64 validUntil
    ) private {
        uint256 len = bytes(certificateId).length;
        if (len == 0) revert EmptyCertificateId();
        if (len > 64) revert CertificateIdTooLong();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();

        bytes32 key = keccak256(bytes(certificateId));
        if (_certificates[key].exists) revert CertificateAlreadyExists(certificateId);

        uint64 nowTs = uint64(block.timestamp);
        _certificates[key] = Certificate({
            documentHash: documentHash,
            issuer: msg.sender,
            issuedAt: nowTs,
            validUntil: validUntil,
            revokedAt: 0,
            revoked: false,
            exists: true
        });
        unchecked {
            totalCertificates++;
        }
        emit CertificateRegistered(key, certificateId, documentHash, msg.sender, nowTs, validUntil);
    }

    /// @notice Revocable by the original issuer (while it still holds ISSUER_ROLE) or by an admin.
    function revokeCertificate(string calldata certificateId) external {
        bytes32 key = keccak256(bytes(certificateId));
        Certificate storage c = _certificates[key];
        if (!c.exists) revert CertificateNotFound(certificateId);
        if (c.revoked) revert CertificateAlreadyRevoked(certificateId);

        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        bool isOriginalIssuer = c.issuer == msg.sender && hasRole(ISSUER_ROLE, msg.sender);
        if (!isAdmin && !isOriginalIssuer) revert NotAuthorizedToRevoke(certificateId, msg.sender);

        uint64 nowTs = uint64(block.timestamp);
        c.revoked = true;
        c.revokedAt = nowTs;
        emit CertificateRevoked(key, certificateId, msg.sender, nowTs);
    }

    function certificateExists(string calldata certificateId) external view returns (bool) {
        return _certificates[keccak256(bytes(certificateId))].exists;
    }

    /// @notice Returns the record; `exists` is false for unknown IDs (does not revert).
    function getCertificate(string calldata certificateId)
        external
        view
        returns (
            bool exists,
            bytes32 documentHash,
            address issuer,
            uint64 issuedAt,
            bool revoked,
            uint64 revokedAt,
            uint64 validUntil
        )
    {
        Certificate memory c = _certificates[keccak256(bytes(certificateId))];
        return (c.exists, c.documentHash, c.issuer, c.issuedAt, c.revoked, c.revokedAt, c.validUntil);
    }

    /// @notice Convenience check: registered, not revoked and hash matches.
    function verifyCertificate(string calldata certificateId, bytes32 documentHash)
        external
        view
        returns (bool valid, bool revoked, bool expired)
    {
        Certificate memory c = _certificates[keccak256(bytes(certificateId))];
        bool isExpired = c.validUntil != 0 && block.timestamp >= c.validUntil;
        return (c.exists && !c.revoked && !isExpired && c.documentHash == documentHash, c.revoked, isExpired);
    }

    function isCertificateExpired(string calldata certificateId)
        external
        view
        returns (bool)
    {
        Certificate memory c = _certificates[keccak256(bytes(certificateId))];
        return c.exists && c.validUntil != 0 && block.timestamp >= c.validUntil;
    }
}
