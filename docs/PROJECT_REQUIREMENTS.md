# Product Requirements Document (PRD)
## Blockchain-Based College Event Certificate Issuance & Verification System

**Institution:** Vivekanand Education Society's Institute of Technology (VESIT)  
**Project type:** Full-stack blockchain application  
**Status:** Development and integration  
**Target outcome:** A working, end-to-end certificate management, issuance and public verification platform.

---

## 1. Product Vision

Build a complete platform through which college administrators and authorized event organizers can create events, manage participants, generate personalized certificates in bulk, issue tamper-evident certificates and allow anyone to verify their authenticity without logging in or connecting a cryptocurrency wallet.

The blockchain must provide verifiable proof of certificate integrity and lifecycle status. It must not be used merely as a decorative feature.

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Smart contracts | Solidity |
| Blockchain development | Hardhat |
| Blockchain interaction | ethers.js |
| Wallet | MetaMask |
| Local blockchain | Hardhat Network |
| Public test network | Ethereum Sepolia |
| Document integrity | SHA-256 |
| Document storage | Local storage for development; IPFS for demonstration |
| Certificate output | PDF |
| Participant input | CSV and XLSX |
| QR generation | QR code containing public verification URL |

Do not introduce another framework or replace existing working components without a demonstrated technical reason.

## 3. User Roles

### 3.1 College Administrator

Must be able to:
- Log in securely.
- Manage administrator and organizer accounts and permissions.
- Manage institution branding, logos and authorized signatures.
- Create, edit, activate and deactivate certificate templates.
- Manage event categories and certificate types.
- View all events and issued certificates.
- View transaction records and issuance statistics.
- Revoke certificates when authorized.
- Review audit history and issuance failures.

### 3.2 Event Organizer

Must be able to:
- Log in securely.
- Create and manage events.
- Select event category and certificate type.
- Select an active certificate template.
- Upload participant CSV/XLSX files.
- Map spreadsheet columns to participant fields.
- Preview and validate participant records.
- Correct or remove invalid records.
- Generate and preview personalized certificates.
- Issue certificates individually or in bulk.
- Track blockchain registration and storage status.
- Retry failed operations without creating duplicate certificates.
- Download individual certificates and bulk ZIP exports.

### 3.3 Public Verifier

Must be able to:
- Scan a certificate QR code.
- Enter a certificate ID.
- Upload an original PDF for integrity verification.
- View the verification result without registration, login or MetaMask.
- See only information intended for public disclosure.

## 4. Event Categories

Support all 12 categories:

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

Event organizers must be able to select the appropriate category when creating an event.

## 5. Certificate Types

Support participation, completion, excellence, winner, runner-up, finalist, best paper, paper presentation, poster presentation, resource person, speaker, mentor, coordinator, organizing committee, best performer, core team member, volunteer appreciation, leadership contribution, innovation award, project showcase, industry visit, merit, achievement, research contribution and outstanding contribution.

Certificate type and event category must be independently configurable.

## 6. Certificate Template Management — 27 Templates

The application must support 27 final certificate templates supplied by the design team.

### Requirements

- Integrate all 27 supplied designs and their corresponding assets.
- Each design must be reusable and configuration-driven.
- Support dynamic participant name, event name, date, certificate type, category, position/rank, team name, project title and other applicable fields.
- Support dynamic logos, signatures, authorized signatories, text, fonts, colors and positioning.
- Support conditional fields where a template requires them.
- Provide a preview before issuance.
- Allow administrators to activate/deactivate templates.
- Allow authorized duplication and editing.
- Preserve template version and configuration snapshots for previously issued certificates.

### Initial template groups

The first three reference designs are:
- Workshop Participation
- Hackathon Winner
- Sports Achievement

The remaining designs must follow the same reusable architecture.

**Important:** Do not create 27 independent hardcoded certificate-generation implementations. Use a common rendering engine and template configurations.

### Template completion acceptance criteria

- All 27 templates are available in the template library.
- Each template renders its supplied design and assets correctly.
- Dynamic fields populate with the correct participant data.
- No text overlaps, clips or disappears.
- Long names and missing optional fields are handled.
- Preview and final PDF rendering use the same configuration.
- Previously issued certificates remain visually reproducible even if a template is subsequently edited.

## 7. Event and Participant Management

### Event management

- Create, edit, view and archive events.
- Store event name, category, dates, description and organizer.
- Associate an event with certificate type and template.
- Support multiple certificate types for an event when required.

### Participant ingestion

Support:
- CSV upload.
- XLSX upload.
- Column mapping.
- Preview before import.
- Row-level validation.
- Duplicate detection.
- Correction and removal of invalid records.
- Clear error messages.

Participant fields should include:
- Student name
- Email
- Roll/registration ID
- Department
- Event category
- Certificate type
- Team name
- Project title
- Position/rank

Optional fields must be handled according to the selected template.

## 8. Certificate Generation and Issuance

For each accepted participant:

1. Generate a globally unique certificate ID.
2. Retrieve the selected template configuration.
3. Populate dynamic participant and event information.
4. Generate the final PDF.
5. Generate a QR code containing the public verification URL and certificate ID.
6. Calculate SHA-256 of the exact finalized PDF bytes.
7. Store the PDF.
8. Obtain and record the storage reference/CID where IPFS is enabled.
9. Register the certificate digest and permitted metadata on the blockchain.
10. Save the transaction hash and operational metadata in PostgreSQL.
11. Mark issuance complete only after the required operations succeed.

The system must not mark a certificate as successfully issued merely because a PDF was generated.

### Failure handling

- Track PDF generation, storage and blockchain registration separately.
- Do not create duplicate certificates when retrying.
- Use idempotency controls.
- Persist transaction and processing status.
- Allow failed certificates to be retried independently.
- Preserve successful records when another participant's issuance fails.

## 9. Blockchain Requirements

The existing Solidity contract must support:

- Certificate registration.
- Unique certificate identification.
- SHA-256 document hash registration.
- Issuer identification.
- Role-based authorization.
- Certificate lookup.
- Existence checks.
- Integrity verification.
- Expiry.
- Revocation.
- Event emission for registration and revocation.

### Privacy requirements

Never place the following on-chain:
- Student names.
- Email addresses.
- Roll numbers.
- Personal contact information.

Store only the document digest and the minimum non-personal metadata required for registry operations.

### Blockchain environments

**Local development**
- Use Hardhat Network.
- Deploy the contract locally.
- Test registration, verification, expiry and revocation.

**Public demonstration**
- Deploy to Sepolia.
- Use MetaMask for user-authorized transactions where required.
- Record contract address and deployment transaction.
- Verify transactions through a block explorer.
- Never use mainnet for this project demonstration.
- Never store a personal wallet seed phrase or expose a real private key in the repository.

## 10. Public Verification

The verification service must use the blockchain registry as the authority for certificate integrity and lifecycle status.

PostgreSQL may supply supplementary public-safe information, but it must not be the sole authority for authenticity.

### Verification methods

**A. Certificate ID**
- Find the registry record.
- Check existence, revocation and expiry.
- Display the certificate's registry status.
- Explain that ID-only verification does not prove the integrity of a PDF file.

**B. Uploaded PDF**
- Calculate SHA-256 of the uploaded original PDF.
- Query the blockchain registry.
- Compare the calculated digest with the registered digest.
- Check expiry and revocation.
- Return the appropriate status.

**C. QR scan**
- Open the public verification page.
- Identify the certificate using its unique ID.
- Allow the verifier to upload the PDF for integrity verification.

### Verification statuses

| Status | Meaning |
|---|---|
| VERIFIED | Certificate exists, document hash matches where PDF was provided, and certificate is active and unexpired |
| TAMPERED | Uploaded PDF hash does not match the registered hash |
| REVOKED | Certificate has been revoked |
| EXPIRED | Certificate validity has ended |
| NOT_FOUND | Certificate does not exist in the registry |

Status precedence must be explicitly defined and tested for combinations such as expired and revoked records.

Public verification must not require login or MetaMask.

## 11. Certificate Lifecycle

Support:

- Issued
- Revoked
- Expired
- Reissued
- Replacement

Reissue must create a new certificate ID and preserve the old record.

Maintain:
- Previous certificate reference.
- Reason for reissue.
- New certificate reference.
- Issuance timestamp.
- Issuer and transaction details.

Never overwrite or silently delete the original blockchain registration.

## 12. Storage

### Development

Use local filesystem storage.

### Demonstration

Integrate the selected IPFS provider.

Store:
- File CID.
- Storage provider.
- File location/reference.
- Upload status.
- Timestamp.

Keep the CID in PostgreSQL rather than treating it as a substitute for the SHA-256 digest.

Explain the privacy implications of publicly retrievable IPFS documents before using real student data. Use synthetic data for demonstrations unless appropriate institutional authorization is obtained.

## 13. Dashboards and Audit

Administrator dashboard:
- Total events.
- Total certificates issued.
- Active and revoked certificates.
- Issuance success/failure statistics.
- Event-wise distribution.
- Recent blockchain transactions.

Organizer dashboard:
- Events managed.
- Participant upload status.
- Certificates generated.
- Certificates issued.
- Failed and pending operations.

Audit records should capture important administrative actions, issuance attempts, retries, revocations and reissues.

## 14. Scalability and Reliability

The system must be designed for batches larger than the initial demonstration.

Requirements:
- Background processing for large batches.
- Configurable chunk size and concurrency.
- Bounded memory consumption.
- Gas-aware blockchain transaction batching.
- Per-certificate processing status.
- Retry with backoff.
- Idempotent issuance.
- Partial failure isolation.
- Resumable batches.
- Progress monitoring.

### Minimum validation

- Issue 10–15 certificates in the final demonstration.
- Run a local test with at least 100 synthetic participant records.
- Measure processing time and failure rate.
- Document tested batch size and resource limitations.
- Do not claim production-scale capacity without load testing.

## 15. Security

- Secure authentication and authorization.
- Password hashing.
- Protected administrative APIs.
- Role-based permissions.
- File type and file size validation.
- CSV/XLSX input validation.
- Public verification rate limiting.
- Safe error messages.
- No exposed secrets in source control.
- No private keys or seed phrases committed to GitHub.
- Protect administrative actions such as revocation and template changes.

## 16. Testing Requirements

### Smart contract
- Successful registration.
- Duplicate certificate rejection.
- Invalid hash rejection.
- Unauthorized registration rejection.
- Authorized revocation.
- Unauthorized revocation rejection.
- Expiry validation.
- Lookup and verification.
- Event emission.

### Backend
- Authentication.
- Authorization.
- Event CRUD.
- Template CRUD.
- CSV/XLSX ingestion.
- Participant validation.
- PDF generation.
- Hash calculation.
- Storage.
- Blockchain integration.
- Verification.
- Revocation and reissue.
- Retry and idempotency.

### Frontend
- Complete organizer workflow.
- Administrator workflow.
- Template previews.
- Upload and validation screens.
- Issuance progress.
- Public verification experience.
- Error and loading states.

### End-to-end
Run a complete workflow:

Create event → select template → upload participants → validate → generate PDFs → calculate hashes → store documents → register on blockchain → verify using ID → verify using original PDF → test tampering → revoke → verify revoked status.

Repeat the workflow on the public testnet after local integration is proven.

## 17. Completion Criteria

The project is complete only when all of the following are satisfied:

- [ ] PostgreSQL setup and Prisma schema are working.
- [ ] Seed data and authentication work.
- [ ] Local blockchain deployment works.
- [ ] Backend successfully reads and writes to the local contract.
- [x] All supplied certificate templates are integrated (28 PDFs currently present in `TEMPLATES/`).
- [x] Supplied templates render through the shared PDF overlay engine with dynamic data.
- [ ] Event and participant management work.
- [ ] CSV/XLSX ingestion and validation work.
- [ ] Individual and bulk certificate generation work.
- [ ] QR codes and unique certificate IDs work.
- [ ] SHA-256 is calculated from final PDF bytes.
- [ ] Local document storage works.
- [ ] IPFS integration works for the demonstration.
- [ ] Blockchain registration is confirmed before successful issuance.
- [ ] Public verification works without login or wallet.
- [ ] PDF tampering is detected.
- [ ] Expiry and revocation work.
- [x] Reissue preserves the original record.
- [x] Dashboard and audit functionality work.
- [x] Large-batch processing is tested with 100 synthetic records (100/100 local success in 14.8 seconds).
- [x] Backend, contract and frontend checks pass locally.
- [x] Full local end-to-end workflow passes locally.
- [ ] Sepolia deployment and public demonstration work.
- [x] README, environment setup and demonstration instructions are complete for local operation.

**Definition of Done:** All supplied template assets are integrated, every major user workflow works end-to-end, blockchain verification is independently demonstrated, and the system passes the agreed test suite. Merely displaying 27 templates in the UI does not constitute project completion.

---

## 18. Implementation Roadmap

1. **Milestone 1 — Environment foundation:** PostgreSQL, Prisma, seed, local Hardhat node and contract deployment.
2. **Milestone 2 — Backend and frontend integration:** Verify authentication, roles, APIs and database operations.
3. **Milestone 3 — Event and participant workflows:** Event management, spreadsheet upload, mapping and validation.
4. **Milestone 4 — Certificate engine:** PDF generation, unique IDs, QR codes and dynamic field rendering.
5. **Milestone 5 — Blockchain and storage:** SHA-256, local storage, IPFS and confirmed contract registration.
6. **Milestone 6 — Public verification:** ID/PDF/QR verification, tamper detection, expiry and revocation.
7. **Milestone 7 — Template integration:** Integrate and test all supplied designs.
8. **Milestone 8 — Lifecycle and dashboards:** Reissue, replacement, analytics, audit and permissions.
9. **Milestone 9 — Reliability and scalability:** Retries with backoff, idempotency, resumable batch processing and 100-record validation.
10. **Milestone 10 — Sepolia demonstration:** Public deployment, MetaMask-authorized operations and final end-to-end validation.

**Implementation rule:** Before each milestone, audit the existing repository, classify features as working, partial, missing or untested, and implement only what is missing. Run focused tests and then end-to-end tests before moving forward. Do not rebuild working functionality.
