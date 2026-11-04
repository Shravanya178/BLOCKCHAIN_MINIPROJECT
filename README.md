# CERTIFIED

Certificate management and public verification for VES Institute of Technology (VESIT).

CERTIFIED lets an authorized organizer create an event, choose a certificate design, upload participant data, issue personalized certificates, store the final PDF on IPFS, and register only its cryptographic proof on Ethereum. Anyone can verify a certificate by ID or by uploading the PDF, without logging in or connecting MetaMask.

## What the system does

- Admin and teacher authentication with role-based access.
- Event creation with event category, certificate type, validity and signatory details.
- Four versioned VESIT certificate PDF designs from the local `TEMPLATES/` assets.
- CSV/XLSX participant parsing with preview, duplicate detection and optional fields.
- Single and bulk certificate issuance.
- Conditional participant fields such as roll number, team, project and position.
- QR codes linking to public verification.
- PDF rendering and SHA-256 hashing of the finalized bytes.
- Local filesystem or Pinata IPFS storage.
- Ethereum registration, expiry and revocation through `CertificateRegistry`.
- Public ID verification and PDF hash verification.
- Issuance batches, audit logs, dashboard statistics and certificate reissue history.

## Architecture

```text
React + Vite frontend
        |
        v
Express REST API
  |       |       |
  |       |       +--> PostgreSQL via Prisma
  |       +----------> PDF/QR renderer -> local storage or Pinata IPFS
  +------------------> ethers.js -> CertificateRegistry on Hardhat/Sepolia
```

The database stores participant and operational data. The smart contract stores the certificate ID, final PDF SHA-256 hash, issuer and lifecycle timestamps. Personal student data is not written on-chain.

## Blockchain flow

1. The backend renders the final PDF.
2. The exact PDF bytes are hashed with SHA-256.
3. The PDF is saved locally or pinned to Pinata.
4. The backend signer submits the certificate ID and hash to `CertificateRegistry`.
5. Public verification reads PostgreSQL and the deployed contract, then compares the stored hash.

The contract uses OpenZeppelin `AccessControl`:

- `DEFAULT_ADMIN_ROLE` manages roles and administrative revocation.
- `ISSUER_ROLE` registers certificates.
- `DEPLOYER_PRIVATE_KEY` is deployment-only.
- `BLOCKCHAIN_PRIVATE_KEY` is the backend runtime signer and must have `ISSUER_ROLE`.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, ethers.js, Lucide |
| Backend | Node.js 20+, Express |
| Database | PostgreSQL, Prisma ORM |
| Smart contract | Solidity 0.8.24, OpenZeppelin AccessControl |
| Blockchain tooling | Hardhat, ethers.js v6 |
| Documents | PDFKit, pdf-lib, QRCode |
| Storage | Local filesystem or Pinata IPFS |
| Validation | Zod |
| Testing | Jest, Supertest, Hardhat |

## Repository layout

```text
backend/
  contracts/              Solidity contracts
  prisma/                 Schema and seed
  scripts/                Deployment and ABI scripts
  src/                    Express API and services
  test/                   API and contract tests
frontend/
  src/                    React application
docs/
  SETUP_AND_RUN.md        Full setup and demonstration guide
TEMPLATES/                Local supplied PDF assets (not committed)
```

## Quick start

Use the detailed [setup and run guide](docs/SETUP_AND_RUN.md). The short version is:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npx prisma generate
npm run db:migrate
npm run db:seed
npm start
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Backend health is available at `http://localhost:4000/health`, readiness at `/ready`, and Swagger at `/api/docs`.

For a temporary public demonstration, expose frontend port `3000` and backend port `4000` through HTTPS tunnels. Set `PUBLIC_FRONTEND_URL` and `CORS_ORIGINS` in `backend/.env`, and set `VITE_API_URL` in `frontend/.env.local` to the backend tunnel's `/api/v1` URL. Restart both processes after changing these values. The QR opens the configured frontend URL and the verification page calls the configured API. See [the setup guide](docs/SETUP_AND_RUN.md#7-temporary-https-tunnel-for-a-public-demonstration) for details.

## Network modes

### Local development

Use `BLOCKCHAIN_NETWORK=localhost`, `CHAIN_ID=31337`, `BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`, `STORAGE_DRIVER=local`, and a local Hardhat deployment.

### Sepolia demonstration

Use `BLOCKCHAIN_NETWORK=sepolia`, `CHAIN_ID=11155111`, a valid authenticated `SEPOLIA_RPC_URL`, a funded deployment wallet, a funded backend issuer wallet, a deployed `CONTRACT_ADDRESS`, and `STORAGE_DRIVER=pinata`. Never commit `.env`, private keys, JWTs or database URLs.

## Security and data handling

- Secrets belong only in ignored `.env` files.
- Never use a real private key in source code or documentation.
- Never put student names, email addresses or roll numbers on-chain.
- Use synthetic data for demonstrations.
- Do not run `prisma db reset` against a shared or production database.
- Review every external transaction before submitting it.

## Validation

```powershell
cd backend
npm run test:contracts
npm run test:api

cd ..\frontend
npm run build
npm run lint
```

The complete acceptance checklist is maintained in [docs/PROJECT_REQUIREMENTS.md](docs/PROJECT_REQUIREMENTS.md).

## Team

- 02 - Shravanya Andhale
- 06 - Arnav Chaudhary
- 11 - Karuna Jeswani
- 12 - Nikhil Kadam
