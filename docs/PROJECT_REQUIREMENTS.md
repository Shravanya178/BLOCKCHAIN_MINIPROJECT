# Product Requirements Document

## Blockchain-Based College Event Certificate Issuance and Verification

**Institution:** VESIT
**Project type:** College-level demonstrable application
**Status:** Baseline product requirements
**Implementation rule:** Extend the existing application; do not rebuild or discard working features.

## 1. Product objective

Provide college administrators and authorized event organizers with a reliable
system to create events, issue tamper-evident digital certificates in bulk,
register document integrity on an Ethereum-compatible blockchain, and allow
the public to verify certificates without logging in.

The initial demonstration must support 10–15 student certificates and the
architecture should be able to scale to thousands of certificates through
bounded batch processing.

## 2. Users and permissions

### College administrator

- Authenticate securely.
- Approve, deactivate, and manage event organizers.
- Manage institutional branding, signatures, certificate policies, and templates.
- View all events, certificates, transactions, audit logs, and analytics.
- Revoke certificates where authorized.

### Event organizer

- Authenticate securely.
- Create, edit, publish, complete, and archive events.
- Select event category, certificate type, and visual template.
- Upload and validate participant data.
- Preview, generate, download, and track certificates.
- Retry failed issuance records.
- View event-level issuance and verification statistics.

### Public verifier

- Verify by QR code or certificate ID without an account or wallet.
- Upload a certificate PDF to verify document integrity.
- View only publicly permitted certificate details.

Backend authorization is mandatory. Frontend visibility alone is not access
control.

## 3. Functional requirements

### 3.1 Event management

An event contains:

- Event ID and title.
- Event category.
- Description.
- Organizer, department or club, and institution.
- Start date, end date, venue or delivery mode.
- Event logo and branding.
- Selected certificate type and visual template.
- Certificate validity policy.
- Lifecycle status: `DRAFT`, `PUBLISHED`, `COMPLETED`, `ARCHIVED`.

### 3.2 Event categories

The product must support:

1. Technical Workshops and Training
2. Hackathons and Coding Competitions
3. Symposiums and Research Conferences
4. Seminars and Guest Lectures
5. Faculty Development and Industrial Training
6. Cultural Events and College Festivals
7. Sports and Athletics
8. Student Council, Clubs and Volunteering
9. Social Outreach and Sustainability
10. Entrepreneurship and Innovation
11. Career Development and Industry Engagement
12. Academic and Institutional Recognition

### 3.3 Certificate types

Support certificate types including:

`Participation`, `Completion`, `Excellence`, `Winner`, `Runner-up`, `Finalist`,
`Best Paper`, `Paper Presentation`, `Poster Presentation`, `Resource Person`,
`Speaker`, `Mentor`, `Coordinator`, `Organizing Committee`, `Best Performer`,
`Core Team Member`, `Volunteer Appreciation`, `Leadership Contribution`,
`Innovation Award`, `Project Showcase`, `Industry Visit`, `Merit`,
`Achievement`, `Research Contribution`, and `Outstanding Contribution`.

### 3.4 Visual templates

Visual templates are configuration-driven reusable layouts, not unrelated
certificate generators. They must support dynamic fields, logos, signatures,
fonts, colors, positioning, preview, duplication, activation/deactivation, and
versioning.

Previously issued certificates must retain an immutable snapshot of the
template layout and certificate data used at issuance.

**Pending input:** The visual template assets and final design specifications
will be supplied later. Until then, template work must preserve the existing
template abstraction and must not invent final visual designs.

Initial template slots to implement after assets are supplied:

1. Workshop Participation
2. Hackathon Winner
3. Sports Achievement

Reference designs supplied by the product owner:

- NEXOTHON 2025 Achievement
- VESIT AGENTIC-AI Participation
- QuestIT Cell Contribution

### 3.5 Participant ingestion

Organizers must be able to upload CSV and XLSX files, preview rows, map columns,
and validate:

- Student name
- Email
- Roll number or registration ID
- Department
- Event category
- Certificate type
- Team name
- Project title
- Position or rank

The system must report row-level errors, missing mandatory values, invalid
emails, duplicate records, and event-specific validation errors. Organizers
must be able to remove or correct invalid rows before generation.

Personal participant information must not be stored on-chain.

### 3.6 Certificate generation

The issuance workflow is:

1. Select an event.
2. Select certificate type and visual template.
3. Upload and map participant data.
4. Validate and preview a sample.
5. Confirm generation.
6. Generate unique certificate IDs and QR codes.
7. Render final PDFs.
8. Hash exact final PDF bytes with SHA-256.
9. Store documents using the configured storage driver/IPFS.
10. Register the document hash and non-personal metadata on-chain.
11. Track each record independently.

The process must be idempotent, chunked, bounded in concurrency, retryable, and
observable with total, pending, successful, and failed counts.

### 3.7 PDF and QR requirements

Each final PDF must include:

- Institutional and event branding.
- Participant information required by the selected certificate type.
- Authorized signatures.
- Certificate ID.
- QR code linking to the public verification page and certificate ID.
- Verification instructions.

The QR code must not contain sensitive personal data. Any modification to the
final PDF must produce a different hash.

### 3.8 Storage and privacy

- Store the SHA-256 hash of the finalized PDF in the database.
- Store the document using local storage for development and the selected IPFS
  provider for demonstration.
- Store IPFS CID and operational metadata in the database.
- Explain the public-retrievability implications of IPFS before using real
  student data.
- Never store names, emails, roll numbers, or other personally identifiable
  information in the smart contract.

### 3.9 Blockchain registry

The registry must support:

- Authorized certificate registration.
- Unique certificate IDs.
- SHA-256 document hash recording.
- Issuer address recording.
- Optional validity expiry.
- Public certificate lookup and hash verification.
- Revocation by permitted authorities.
- Registration and revocation events.
- Rejection of invalid input, unauthorized operations, and duplicates.

The current contract uses OpenZeppelin `AccessControl`, records only
non-personal certificate metadata, and supports optional expiry.

### 3.10 Public verification

Verification must work without login or MetaMask:

- By QR/certificate ID.
- By uploaded PDF.

Results:

- `VERIFIED`: record exists, hash matches, active, and unexpired.
- `TAMPERED`: uploaded PDF hash differs from the registered hash.
- `REVOKED`: certificate is revoked.
- `EXPIRED`: validity period has ended.
- `NOT_FOUND`: no matching certificate exists.

ID-only verification must state that document integrity cannot be confirmed
without the original PDF.

### 3.11 Certificate lifecycle

The system must preserve old records and support:

- Issued certificates.
- Revoked certificates.
- Expired certificates.
- Reissued certificates.
- Replacement certificates.
- Audit history.

Reissue creates a new certificate ID and references the prior certificate and
reason; it never overwrites an existing blockchain record.

### 3.12 Dashboard and audit

Administrators and organizers must be able to view:

- Events and certificates issued.
- Pending, successful, failed, revoked, and expired registrations.
- Verification requests and success rate.
- Event-wise and template-wise issuance.
- Filters by event, date, department, certificate type, and status.
- Audit history for material actions.

## 4. Wallet and network requirements

- Use MetaMask only when the user initiates a wallet action.
- Display wallet address and current network.
- Detect and clearly report a wrong network.
- Support switching to Sepolia (chain ID `11155111`).
- Handle rejected connections, rejected transactions, insufficient funds,
  pending transactions, failures, confirmations, and receipt hashes.
- Display Etherscan links for Sepolia transactions.
- Keep RPC URLs, contract addresses, and other configuration in environment
  variables.
- Never request, store, expose, or commit private keys or seed phrases.
- Do not deploy to or transact on mainnet.

Public verification and read-only blockchain access must not require a wallet.

## 5. Non-functional requirements

- Preserve existing APIs and data compatibility where possible.
- Validate all backend input server-side.
- Use secure password handling and protected routes.
- Restrict file types and sizes.
- Rate-limit public verification.
- Surface errors explicitly and retain useful audit context.
- Avoid duplicate frameworks and dependencies.
- Do not reset or delete existing databases or records.
- Keep frontend, backend, database, storage, and blockchain responsibilities
  separated.
- Support a repeatable local development and test workflow.

## 6. Acceptance criteria

The product is accepted when:

1. An administrator can authenticate.
2. An authorized organizer can create and manage an event.
3. The organizer can select category, certificate type, and template.
4. CSV/XLSX participant data can be mapped, validated, corrected, and confirmed.
5. The system generates 10–15 personalized PDFs with unique IDs and QR codes.
6. Each final PDF receives an exact-byte SHA-256 hash.
7. Documents are stored through the configured storage solution.
8. Hashes are registered on Sepolia after explicit deployment approval.
9. Transaction hashes and receipts are visible to authorized users.
10. The public can verify by ID and by PDF without login or MetaMask.
11. A modified PDF is reported as `TAMPERED`.
12. Revoked and expired certificates report the correct status.
13. Reissue creates a new ID and preserves the previous record.
14. Dashboards show issuance and verification status.
15. Relevant frontend, backend, database, and contract tests pass.

## 7. Incremental delivery plan

### Milestone 1 — Reproducible local foundation

- Local Hardhat node and deployment.
- Backend environment setup without secrets in source control.
- Prisma generation/migration validation.
- Frontend build and lint on a supported Node version.

### Milestone 2 — Domain and lifecycle

- Event categories and certificate types.
- Validity policy in event/issuance APIs.
- Immutable issuance snapshots.
- Reissue and replacement relationships.

### Milestone 3 — Participant ingestion

- XLSX support.
- Column mapping.
- Row correction/removal.
- Event-specific validation.

### Milestone 4 — End-to-end local issuance

- Generate and verify 10–15 certificates.
- Test tamper detection and revocation.
- Test expiry through the complete API and UI.
- Test retries and idempotency.

### Milestone 5 — Template assets

- Incorporate the supplied visual templates.
- Configure the three initial designs.
- Verify previews, snapshots, signatures, logos, and PDF output.

### Milestone 6 — Sepolia demonstration

- Obtain explicit approval before deployment.
- Deploy using environment-based configuration.
- Configure backend and frontend contract addresses.
- Run a controlled 10–15 certificate demonstration.

## 8. Current implementation baseline

The existing repository already contains React/Vite, Express, Prisma,
Hardhat/Solidity, ethers.js, PDF, QR, authentication, IPFS adapter, public
verification, and audit modules. New work must extend those modules and must
be verified with focused tests before being marked complete.
