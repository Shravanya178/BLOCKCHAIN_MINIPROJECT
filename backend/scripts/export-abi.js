/* eslint-disable no-console */
/**
 * Copies the compiled ABI into src/modules/blockchain/abi so the backend can run
 * without Hardhat artifacts. Run after `npx hardhat compile` (npm run compile).
 */
const fs = require('fs');
const path = require('path');

const artifact = path.resolve(__dirname, '../artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json');
const outDir = path.resolve(__dirname, '../src/modules/blockchain/abi');

if (!fs.existsSync(artifact)) {
  console.error('Artifact not found. Run `npx hardhat compile` first.');
  process.exit(1);
}
const { abi } = JSON.parse(fs.readFileSync(artifact, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'CertificateRegistry.json'), `${JSON.stringify({ contractName: 'CertificateRegistry', abi }, null, 2)}\n`);
console.log('ABI exported to src/modules/blockchain/abi/CertificateRegistry.json');
