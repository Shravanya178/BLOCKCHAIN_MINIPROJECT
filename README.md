# Blockchain-Based Academic and Event Certificate Generation & Verification System

Backend and Blockchain Integration for college event certificate issuance, PDF cryptographic hashing, smart contract registration, and public verification.

---

## 👥 Project Team
- **02 - Shravanya Andhale**
- **06 - Arnav Chaudhary**
- **11 - Karuna Jeswani**
- **12 - Nikhil Kadam**

---

## 🏗️ Architecture & Tech Stack

- **Backend Framework:** Node.js & Express.js
- **Database:** PostgreSQL (Neon Serverless) with Prisma ORM
- **Smart Contract:** Solidity `CertificateRegistry` (OpenZeppelin AccessControl)
- **Blockchain Framework:** Hardhat & ethers.js v6
- **Networks:** Local Hardhat Network (ChainId: 31337) / Sepolia Testnet
- **PDF Generation & Rendering:** PDFKit with dynamic text layout & Canva background overlay
- **QR Codes:** `qrcode` library pointing to public verification endpoint
- **Authentication:** JWT (access & rotating refresh tokens), bcryptjs password hashing
- **File Uploads:** Multer (CSV bulk recipients, PDF verification uploads, Canva backgrounds)
- **API Documentation:** Interactive Swagger UI at `/api/docs`

---

## 🚀 Quick Start (Windows PowerShell)

### 1. Prerequisites
- **Node.js** v20+ and **npm** v10+
- **Git**
- PostgreSQL database URL (configured in `backend/.env`)

### 2. Install Dependencies
```powershell
cd backend
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```
Ensure `DATABASE_URL` is set to your PostgreSQL instance.

### 4. Database Setup & Seeding
```powershell
npx prisma db push
node prisma/seed.js
```
The seed script creates:
- **Admin account:** `admin@college.edu` / `Admin@12345`
- **Teacher account:** `teacher@college.edu` / `Teacher@12345`
- **Starter Canva-compatible templates** (Participation, Achievement, Workshop, Technical)
- **Demo College Event:** *HackVenture 2026 - Annual Hackathon*

### 5. Start Local Blockchain
In a separate terminal:
```powershell
cd backend
npm run chain
```
This boots Hardhat local node at `http://127.0.0.1:8545`.

### 6. Deploy Smart Contract
In another terminal:
```powershell
cd backend
npm run deploy:local
```
This deploys `CertificateRegistry.sol` and writes `deployments/localhost.json`.

### 7. Start the Backend API Server
```powershell
cd backend
npm start
```
- API Base: `http://localhost:4000/api/v1`
- Swagger UI: `http://localhost:4000/api/docs`
- Health check: `http://localhost:4000/health`
- Readiness check: `http://localhost:4000/ready`

---

## 🧪 Testing

### Run Smart Contract Tests:
```powershell
npm run test:contracts
```
Covers:
- Role-based access control (Admin / Issuer)
- Certificate registration & event emission
- Duplicate certificate ID prevention
- Custom error validation
- Public lookup and verification
- Certificate revocation by authorized roles

### Run API End-to-End Tests:
```powershell
npm run test:api
```

---

## 📋 Key REST API Endpoints

### 🔐 Authentication
- `POST /api/v1/auth/login` - Login with email and password
- `POST /api/v1/auth/refresh` - Rotate refresh token
- `GET /api/v1/auth/me` - Get authenticated profile
- `POST /api/v1/auth/logout` - Invalidate session

### 📅 Events
- `GET /api/v1/events` - List college events
- `POST /api/v1/events` - Create event (Teacher / Admin)
- `GET /api/v1/events/:id` - View event details & issuance stats
- `PATCH /api/v1/events/:id` - Update event
- `POST /api/v1/events/:id/archive` - Archive event

### 🎨 Templates (Canva Integration)
- `GET /api/v1/templates` - List templates
- `GET /api/v1/templates/:id/preview` - Download sample preview PDF
- `GET /api/v1/templates/:id/background` - Download Canva background image
- `PATCH /api/v1/templates/:id` - Upload exported Canva PNG/JPG & adjust fractional field coordinates

### 🎓 Certificate Issuance
- `POST /api/v1/certificates` - Issue a single certificate:
  1. Personalizes certificate PDF
  2. Embeds dynamic QR code pointing to `/api/v1/verify/<id>`
  3. Computes SHA-256 hash of finalized PDF bytes
  4. Submits transaction to `CertificateRegistry` smart contract
  5. Waits for confirmation and stores tx hash and block number
- `POST /api/v1/certificates/bulk` - Bulk issuance via CSV upload or JSON list (supports 10-15+ students with per-row statuses)
- `GET /api/v1/certificates` - List certificates with filters
- `GET /api/v1/certificates/:id/pdf` - Download generated certificate PDF
- `POST /api/v1/certificates/:id/retry` - Safely retry failed blockchain registrations
- `POST /api/v1/certificates/:id/revoke` - Revoke certificate on-chain and in DB

### 🔍 Public Verification (No Login Required)
- `GET /api/v1/verify/:certificateId` - Verify certificate by ID:
  - Reads live state from blockchain smart contract
  - Returns `VERIFIED`, `NOT_FOUND`, or `REVOKED`
  - Returns transaction hash, block number, and certificate details
- `POST /api/v1/verify/document` - Verify uploaded PDF file:
  - Computes SHA-256 of uploaded bytes
  - Matches with blockchain registry
  - Returns `HASH_MISMATCH` if any pixel or text in the PDF was altered!

---

## 📄 CSV Bulk Upload Format

```csv
student_name,student_id,achievement
"Arnav Chaudhary","CS-2023-001","First Place"
"Shravanya Andhale","CS-2023-002","Second Place"
"Karuna Jeswani","CS-2023-003","Third Place"
"Nikhil Kadam","CS-2023-004","Participant"
```
