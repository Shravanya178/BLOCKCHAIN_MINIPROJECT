// Contract Configuration and ABI for direct browser Web3 / ethers.js interaction
export const CONTRACT_ABI = [
  "constructor(address admin, address issuer)",
  "error AccessControlBadConfirmation()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error CertificateAlreadyExists(string certificateId)",
  "error CertificateAlreadyRevoked(string certificateId)",
  "error CertificateIdTooLong()",
  "error CertificateNotFound(string certificateId)",
  "error EmptyCertificateId()",
  "error InvalidDocumentHash()",
  "error NotAuthorizedToRevoke(string certificateId, address caller)",
  "event CertificateRegistered(bytes32 indexed certificateKey, string certificateId, bytes32 indexed documentHash, address indexed issuer, uint64 issuedAt)",
  "event CertificateRevoked(bytes32 indexed certificateKey, string certificateId, address indexed revokedBy, uint64 revokedAt)",
  "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function ISSUER_ROLE() view returns (bytes32)",
  "function certificateExists(string certificateId) view returns (bool)",
  "function certificateKey(string certificateId) pure returns (bytes32)",
  "function getCertificate(string certificateId) view returns (bool exists, bytes32 documentHash, address issuer, uint64 issuedAt, bool revoked, uint64 revokedAt)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function grantRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function registerCertificate(string certificateId, bytes32 documentHash)",
  "function renounceRole(bytes32 role, address callerConfirmation)",
  "function revokeCertificate(string certificateId)",
  "function revokeRole(bytes32 role, address account)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function totalCertificates() view returns (uint256)",
  "function verifyCertificate(string certificateId, bytes32 documentHash) view returns (bool valid, bool revoked)"
];

// Fallback ABI for root contract if testing directly with root Solidity interface
export const ROOT_CONTRACT_ABI = [
  "constructor(address initialAdmin)",
  "function ISSUER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function addIssuer(address account)",
  "function removeIssuer(address account)",
  "function issueCertificate(string certificateId, bytes32 certificateHash, string ipfsCID)",
  "function issueCertificatesBatch(string[] certificateIds, bytes32[] certificateHashes, string[] ipfsCIDs)",
  "function revokeCertificate(string certificateId)",
  "function getCertificate(string certificateId) view returns (bytes32 certificateHash, string ipfsCID, address issuer, uint256 issuedAt, bool valid)",
  "function verifyCertificate(string certificateId, bytes32 certificateHash) view returns (bool)",
  "function isIssuer(address account) view returns (bool)"
];

export const NETWORKS = {
  31337: {
    chainId: "0x7a69",
    chainName: "Hardhat Localhost",
    rpcUrls: ["http://127.0.0.1:8545"],
    nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: null,
  },
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Testnet",
    rpcUrls: ["https://rpc.sepolia.org"],
    nativeCurrency: { name: "Sepolia ETH", symbol: "SEP", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
};

export const DEFAULT_CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const ISSUER_ROLE_HASH = "0x4953535545525f524f4c45000000000000000000000000000000000000000000"; // keccak256("ISSUER_ROLE") calculated dynamically in web3.js
