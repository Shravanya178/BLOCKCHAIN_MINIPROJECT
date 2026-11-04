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
const { ethers } = require('ethers');

function requireAddress(value, variableName) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${variableName} must be a valid Ethereum address`);
  }
  return value;
}

async function grantConfiguredIssuerRole(registry, deployer, configuredIssuer, adminRole, issuerRole) {
  const issuerAddress = requireAddress(configuredIssuer, 'ISSUER_ADDRESS');
  if (issuerAddress.toLowerCase() === deployer.address.toLowerCase()) {
    console.log(`Issuer:      ${deployer.address} (deployer already has ISSUER_ROLE)`);
    return;
  }

  const alreadyIssuer = await registry.hasRole(issuerRole, issuerAddress);
  if (alreadyIssuer) {
    console.log(`Issuer:      ${issuerAddress} (already has ISSUER_ROLE)`);
    return;
  }

  const deployerIsAdmin = await registry.hasRole(adminRole, deployer.address);
  if (!deployerIsAdmin) {
    throw new Error(
      `Cannot grant ISSUER_ROLE to ${issuerAddress}: deployer ${deployer.address} ` +
      'does not hold DEFAULT_ADMIN_ROLE. Grant the role using the configured administrator wallet.',
    );
  }

  const tx = await registry.grantRole(issuerRole, issuerAddress);
  await tx.wait();
  if (!(await registry.hasRole(issuerRole, issuerAddress))) {
    throw new Error(`ISSUER_ROLE grant transaction completed but was not observed for ${issuerAddress}`);
  }
  console.log(`Granted ISSUER_ROLE to ${issuerAddress}`);
}

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error(`No deployer account configured for network "${network.name}"`);

  const admin = requireAddress(process.env.CONTRACT_ADMIN_ADDRESS || deployer.address, 'CONTRACT_ADMIN_ADDRESS');
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

  const adminRole = await registry.DEFAULT_ADMIN_ROLE();
  const issuerRole = await registry.ISSUER_ROLE();
  if (!(await registry.hasRole(adminRole, admin))) {
    throw new Error(`Deployment verification failed: ${admin} does not hold DEFAULT_ADMIN_ROLE`);
  }
  if (!(await registry.hasRole(issuerRole, issuer))) {
    throw new Error(`Deployment verification failed: ${issuer} does not hold ISSUER_ROLE`);
  }

  const extraIssuer = process.env.ISSUER_ADDRESS;
  if (extraIssuer) {
    await grantConfiguredIssuerRole(registry, deployer, extraIssuer, adminRole, issuerRole);
  } else if (admin.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(
      `Administrator: ${admin} (different from deployer; additional role grants require this administrator)`,
    );
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
  const deploymentPath = path.join(dir, `${network.name}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(deploymentPath, `${JSON.stringify(info, null, 2)}\n`);

  console.log(`Contract:    ${address}`);
  console.log(`Network:     ${network.name}`);
  console.log(`Chain ID:    ${info.chainId}`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`Administrator: ${admin}`);
  console.log(`Issuer:      ${issuer}`);
  console.log(`Saved:       ${deploymentPath}`);
  if (network.name === 'sepolia') console.log(`Etherscan: https://sepolia.etherscan.io/address/${address}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}

module.exports = { grantConfiguredIssuerRole, requireAddress };
