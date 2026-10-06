// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract CertificateRegistry is AccessControl {
    // Role allowed to issue and revoke certificates
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Certificate {
        bytes32 certificateHash;
        string ipfsCID;
        address issuer;
        uint256 issuedAt;
        bool valid;
    }

    // Certificate ID => Certificate
    mapping(string => Certificate) private certificates;

    // Events for frontend/backend and blockchain auditability
    event CertificateIssued(
        string indexed certificateId,
        bytes32 certificateHash,
        string ipfsCID,
        address indexed issuer,
        uint256 issuedAt
    );

    event CertificateRevoked(
        string indexed certificateId,
        address indexed issuer,
        uint256 revokedAt
    );

    event IssuerAdded(
        address indexed account,
        address indexed admin
    );

    event IssuerRemoved(
        address indexed account,
        address indexed admin
    );

    constructor(address initialAdmin) {
        require(initialAdmin != address(0), "Invalid admin address");

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ISSUER_ROLE, initialAdmin);
    }

    /**
     * @notice Add an authorized certificate issuer.
     * @dev Only an administrator can add issuers.
     */
    function addIssuer(address account)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(account != address(0), "Invalid issuer address");

        grantRole(ISSUER_ROLE, account);

        emit IssuerAdded(account, msg.sender);
    }

    /**
     * @notice Remove an authorized certificate issuer.
     */
    function removeIssuer(address account)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        revokeRole(ISSUER_ROLE, account);

        emit IssuerRemoved(account, msg.sender);
    }

    /**
     * @notice Issue a single certificate.
     */
    function issueCertificate(
        string calldata certificateId,
        bytes32 certificateHash,
        string calldata ipfsCID
    )
        external
        onlyRole(ISSUER_ROLE)
    {
        require(bytes(certificateId).length > 0, "Certificate ID required");
        require(certificateHash != bytes32(0), "Certificate hash required");
        require(bytes(ipfsCID).length > 0, "IPFS CID required");

        // Prevent duplicate certificate IDs
        require(
            certificates[certificateId].issuedAt == 0,
            "Certificate already exists"
        );

        certificates[certificateId] = Certificate({
            certificateHash: certificateHash,
            ipfsCID: ipfsCID,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            valid: true
        });

        emit CertificateIssued(
            certificateId,
            certificateHash,
            ipfsCID,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Issue multiple certificates in one transaction.
     * @dev Used for the 10-15 certificate live demonstration.
     */
    function issueCertificatesBatch(
        string[] calldata certificateIds,
        bytes32[] calldata certificateHashes,
        string[] calldata ipfsCIDs
    )
        external
        onlyRole(ISSUER_ROLE)
    {
        uint256 length = certificateIds.length;

        require(length > 0, "No certificates provided");
        require(
            length == certificateHashes.length &&
            length == ipfsCIDs.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < length; i++) {
            require(
                bytes(certificateIds[i]).length > 0,
                "Certificate ID required"
            );

            require(
                certificateHashes[i] != bytes32(0),
                "Certificate hash required"
            );

            require(
                bytes(ipfsCIDs[i]).length > 0,
                "IPFS CID required"
            );

            require(
                certificates[certificateIds[i]].issuedAt == 0,
                "Certificate already exists"
            );

            certificates[certificateIds[i]] = Certificate({
                certificateHash: certificateHashes[i],
                ipfsCID: ipfsCIDs[i],
                issuer: msg.sender,
                issuedAt: block.timestamp,
                valid: true
            });

            emit CertificateIssued(
                certificateIds[i],
                certificateHashes[i],
                ipfsCIDs[i],
                msg.sender,
                block.timestamp
            );
        }
    }

    /**
     * @notice Revoke a certificate.
     * @dev The certificate remains permanently recorded,
     *      but its validity becomes false.
     */
    function revokeCertificate(string calldata certificateId)
        external
        onlyRole(ISSUER_ROLE)
    {
        require(
            certificates[certificateId].issuedAt != 0,
            "Certificate does not exist"
        );

        require(
            certificates[certificateId].valid,
            "Certificate already revoked"
        );

        certificates[certificateId].valid = false;

        emit CertificateRevoked(
            certificateId,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Retrieve a certificate's blockchain record.
     */
    function getCertificate(string calldata certificateId)
        external
        view
        returns (
            bytes32 certificateHash,
            string memory ipfsCID,
            address issuer,
            uint256 issuedAt,
            bool valid
        )
    {
        require(
            certificates[certificateId].issuedAt != 0,
            "Certificate does not exist"
        );

        Certificate memory certificate = certificates[certificateId];

        return (
            certificate.certificateHash,
            certificate.ipfsCID,
            certificate.issuer,
            certificate.issuedAt,
            certificate.valid
        );
    }

    /**
     * @notice Verify a certificate against its expected document hash.
     */
    function verifyCertificate(
        string calldata certificateId,
        bytes32 certificateHash
    )
        external
        view
        returns (bool)
    {
        Certificate memory certificate = certificates[certificateId];

        if (certificate.issuedAt == 0) {
            return false;
        }

        if (!certificate.valid) {
            return false;
        }

        return certificate.certificateHash == certificateHash;
    }

    /**
     * @notice Check whether an address is an authorized issuer.
     */
    function isIssuer(address account)
        external
        view
        returns (bool)
    {
        return hasRole(ISSUER_ROLE, account);
    }
}