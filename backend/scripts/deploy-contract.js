/* eslint-disable no-console */
/**
 * Deploys CertificateRegistry and writes deployments/<network>.json, which the
 * backend reads when CONTRACT_ADDRESS is not set.
 *
 *   npx hardhat run scripts/deploy-contract.js --network localhost
 *   npx hardhat run scripts/deploy-contract.js --network sepolia
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error(`No deployer account configured for network "${network.name}"`);

  const admin = process.env.CONTRACT_ADMIN_ADDRESS || deployer.address;
  // The backend signer must hold ISSUER_ROLE. Locally that is the deployer.
  const issuer = deployer.address;

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId})`);
  console.log(`Deployer: ${deployer.address} (balance ${ethers.formatEther(balance)} ETH)`);
  if (balance === 0n) throw new Error('Deployer has zero balance. Fund it before deploying.');

  const Registry = await ethers.getContractFactory('CertificateRegistry');
  const registry = await Registry.deploy(admin, issuer);
  const deployTx = registry.deploymentTransaction();
  console.log(`Deploy tx: ${deployTx.hash} (waiting for confirmation...)`);
  await registry.waitForDeployment();
  const receipt = await deployTx.wait(network.name === 'sepolia' ? 2 : 1);
  const address = await registry.getAddress();

  const extraIssuer = process.env.ISSUER_ADDRESS;
  if (extraIssuer && ethers.isAddress(extraIssuer) && extraIssuer.toLowerCase() !== issuer.toLowerCase()) {
    const tx = await registry.grantRole(await registry.ISSUER_ROLE(), extraIssuer);
    await tx.wait();
    console.log(`Granted ISSUER_ROLE to ${extraIssuer}`);
  }

  const info = {
    contractName: 'CertificateRegistry',
    address,
    network: network.name,
    chainId: Number(network.config.chainId),
    admin,
    issuer,
    deployer: deployer.address,
    txHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.resolve(__dirname, '../deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), `${JSON.stringify(info, null, 2)}\n`);

  console.log(`CertificateRegistry deployed at ${address} (block ${receipt.blockNumber})`);
  console.log(`Saved deployments/${network.name}.json`);
  if (network.name === 'sepolia') console.log(`Etherscan: https://sepolia.etherscan.io/address/${address}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
