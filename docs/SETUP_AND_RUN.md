# Setup and Run Guide

This guide explains how to run CertiChain locally and how to switch the same application to Sepolia and Pinata. Commands are written for Windows PowerShell.

## 1. Prerequisites

Install:

- Node.js 20.19 or newer
- Git
- PostgreSQL 14 or newer
- A browser with JavaScript enabled

Node 20.19+ is recommended because the Vite/Rolldown Windows native binding requires it.

## 2. Install dependencies

From the repository root:

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

## 3. Prepare local assets

The original PDF designs are intentionally excluded from Git because they are large binary assets. Place the supplied individual PDFs in:

```text
TEMPLATES\
```

The seed expects the original filenames used by `backend/src/modules/templates/assetTemplates.js`. Do not rename or edit those PDFs.

The optional `VESIT_participants.xlsx` demonstration workbook is also excluded from Git. Keep it local and use synthetic data only.

## 4. Configure the backend

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env`:

### Local database and local blockchain

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/certificate_registry
DIRECT_URL=postgresql://USER:PASSWORD@localhost:5432/certificate_registry
BLOCKCHAIN_NETWORK=localhost
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
BLOCKCHAIN_PRIVATE_KEY=0xLOCAL_HARDHAT_ISSUER_KEY
CONTRACT_ADDRESS=
STORAGE_DRIVER=local
```

Set JWT and seed passwords to strong local-only values. Do not copy real credentials into `.env.example` or Git.

## 5. Initialize PostgreSQL and Prisma

Create an empty PostgreSQL database named `certificate_registry`, then run:

```powershell
cd backend
npx prisma generate
npm run db:migrate
npm run db:seed
```

Do not use `npm run db:reset` unless the database is disposable and you explicitly intend to delete its data.

## 6. Run locally with Hardhat

Terminal 1:

```powershell
cd backend
npm run chain
```

Terminal 2:

```powershell
cd backend
npm run deploy:local
```

Copy the local deployment address into `CONTRACT_ADDRESS` only if the runtime configuration does not load it from the local deployment file.

Terminal 3:

```powershell
cd backend
npm start
```

Terminal 4:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## 7. Use the application

1. Open **Authority Login**.
2. Sign in with the seeded admin or teacher account.
3. Open **Event Management** and create an event.
4. Select a template and certificate type.
5. Use **Single Issuance** or upload a CSV/XLSX in **Bulk CSV/XLSX Engine**.
6. Review the participant preview.
7. Issue the certificate.
8. Open **Verification Hub**.
9. Verify by certificate ID or upload the generated PDF.

Optional participant columns are:

```text
student_id, roll_number, team_name, project_title, position,
achievement, certificate_title, department, email
```

`student_name` is required. Empty optional values remain empty and are not replaced with `N/A`.

## 8. Sepolia and Pinata mode

Use a funded Sepolia deployment wallet and a separate or explicitly authorized backend issuer wallet. Configure:

```dotenv
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_RPC_URL=https://YOUR_SEPOLIA_RPC
CHAIN_ID=11155111
SEPOLIA_RPC_URL=https://YOUR_SEPOLIA_RPC
DEPLOYER_PRIVATE_KEY=0xYOUR_DEPLOYMENT_ONLY_KEY
CONTRACT_ADMIN_ADDRESS=0xOPTIONAL_ADMIN_ADDRESS
ISSUER_ADDRESS=0xOPTIONAL_ISSUER_ADDRESS
BLOCKCHAIN_PRIVATE_KEY=0xBACKEND_ISSUER_KEY
CONTRACT_ADDRESS=0xDEPLOYED_CONTRACT_ADDRESS
STORAGE_DRIVER=pinata
PINATA_JWT=YOUR_PINATA_JWT
PINATA_GATEWAY=gateway.pinata.cloud
```

Deploy only after checking the RPC, wallet funding and role plan:

```powershell
cd backend
npm run deploy:sepolia
```

The script writes deployment metadata to `backend/deployments/sepolia.json`, which is ignored because deployment metadata can be environment-specific. The backend runtime must still resolve the deployed address through `CONTRACT_ADDRESS` or the matching deployment file.

Before any real issuance, test Pinata with a synthetic PDF and confirm that the JWT has file-upload permission. Never upload real student data without authorization.

## 9. Health and API inspection

With the backend running:

- Health: `http://localhost:4000/health`
- Readiness: `http://localhost:4000/ready`
- Swagger: `http://localhost:4000/api/docs`
- API prefix: `http://localhost:4000/api/v1`

The public verification endpoints do not require login:

```text
GET  /api/v1/verify/:certificateId
POST /api/v1/verify/document
```

## 10. Validation commands

Run focused checks during development:

```powershell
cd backend
npm run test:contracts
npm run test:api

cd ..\frontend
npm run build
npm run lint
```

Do not run external transactions merely to validate a code change. Use local Hardhat for routine development and reserve Sepolia for an intentional demonstration.

## 11. Troubleshooting

### Database connection fails

Check PostgreSQL is running and both `DATABASE_URL` and `DIRECT_URL` point to the intended database.

### Contract address is missing

Run the matching deployment command and set `CONTRACT_ADDRESS`, or ensure the matching `backend/deployments/<network>.json` file exists locally.

### Backend cannot register

Confirm that `BLOCKCHAIN_PRIVATE_KEY` derives to a wallet with `ISSUER_ROLE` and that the RPC chain ID is correct.

### Pinata returns `403 NO_SCOPES_FOUND`

The JWT authenticates but lacks file-pinning permission. Create or update a Pinata key with `pinFileToIPFS` permission and replace only the local `.env` value.

### Templates are missing

Restore the supplied PDFs under the root `TEMPLATES\` directory. They are intentionally not downloaded or regenerated by the application.
