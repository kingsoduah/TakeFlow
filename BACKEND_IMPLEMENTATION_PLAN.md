# **TAKEFLOW**

# **Backend Implementation Plan**

**Product:** TakeFlow  
**Tagline:** Know What You're Owed. Know What You've Received.  
**Document Type:** Technical Implementation Plan  
**Version:** 1.0  
**Status:** Phase 4 Complete — Roqqu, Wallets, Webhooks, Reconciliation & Swagger
**Primary Integration:** Roqqu API Services (RAS)

---

## **1\. Purpose of This Document**

This document defines the technical approach, architecture, development phases, backend responsibilities, integration strategy, and implementation priorities for TakeFlow.

It serves as the primary engineering guide for backend development.

The Product Requirements Document explains what TakeFlow should accomplish. This document explains how the backend should be designed and implemented to achieve those requirements.

All implementation decisions must remain consistent with the PRD and the verified Roqqu API documentation.

## **2\. Backend Technology Stack**

The proposed backend stack is:

| Component | Technology |
| ----- | ----- |
| Runtime | Node.js |
| Language | TypeScript |
| Framework | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| API style | REST |
| Authentication | JWT-based authentication |
| Validation | NestJS validation / class-validator |
| API documentation | Swagger / OpenAPI |
| Testing | Jest |
| External payment infrastructure | Roqqu API Services |
| Environment configuration | Environment variables |

If the existing repository already has a working technology stack, inspect it before making changes. Do not replace an existing working setup without a clear technical reason and approval.

## **3\. Backend Architecture**

The backend should follow a modular architecture.

Each module should have a clear responsibility and communicate through well-defined services.

Proposed modules:

* AuthModule: registration, login, authentication and user identity.  
* UsersModule: user profile and account information.  
* BusinessesModule: business creation, ownership and business settings.  
* ClientsModule: client management.  
* InvoicesModule: invoice creation, updates, status and outstanding balances.  
* WalletsModule: receiving wallet and address management.  
* PaymentsModule: payment records and payment processing.  
* TransactionsModule: blockchain transaction records and verification.  
* ReconciliationModule: matching received transactions to invoices.  
* RoqquModule: communication with Roqqu APIs.  
* WebhooksModule: incoming webhook handling and event processing.  
* ReportsModule: receivables summaries and payment reports.  
* HealthModule: service health checks.

Keep the implementation modular, but avoid unnecessary complexity for the hackathon MVP.

## **4\. Core Database Design**

Use PostgreSQL with Prisma.

The following entities represent the proposed initial data model. Inspect the existing schema before creating or modifying models.

### **User**

Stores registered platform users.

Suggested fields:

* id  
* fullName  
* email  
* passwordHash  
* createdAt  
* updatedAt

### **Business**

Represents a business account owned by a user.

Suggested fields:

* id  
* ownerId  
* businessName  
* businessEmail  
* businessType  
* createdAt  
* updatedAt

### **Client**

Stores customers or organisations that owe a business money.

Suggested fields:

* id  
* businessId  
* name  
* email  
* createdAt  
* updatedAt

### **Invoice**

Represents a payment obligation created by a business.

Suggested fields:

* id  
* businessId  
* clientId  
* invoiceNumber  
* description  
* amount  
* asset  
* network  
* dueDate  
* receivingAddress  
* status  
* amountReceived  
* amountOutstanding  
* createdAt  
* updatedAt

Initial invoice statuses:

* DRAFT  
* PENDING  
* PARTIALLY\_PAID  
* PAID  
* OVERDUE  
* EXPIRED

### **Wallet**

Stores receiving wallet information returned by Roqqu.

Suggested fields:

* id  
* businessId  
* clientId (optional)  
* invoiceId (optional)  
* address  
* network  
* provider  
* createdAt  
* updatedAt

Do not assume that every invoice receives a unique address. Confirm Roqqu's address-generation and reuse behaviour before implementing address assignment.

### **Transaction**

Stores blockchain payment information.

Suggested fields:

* id  
* businessId  
* invoiceId (optional)  
* walletId (optional)  
* transactionHash  
* network  
* asset  
* amount  
* receivingAddress  
* senderAddress  
* providerReference  
* providerStatus  
* reconciliationStatus  
* createdAt  
* updatedAt

A transaction must be allowed to exist without an invoice association. This is necessary for unmatched payments.

### **WebhookEvent**

Stores incoming webhook events for traceability and idempotency.

Suggested fields:

* id  
* provider  
* eventId  
* eventType  
* transactionHash (optional)  
* processingStatus  
* payload  
* receivedAt  
* processedAt  
* errorMessage

Enforce appropriate uniqueness constraints, particularly for provider event IDs and transaction hashes where the provider's behaviour permits.

### **Important Database Rules**

1. Use Prisma Decimal or an equivalent precise decimal representation for monetary values. Never use JavaScript floating-point arithmetic for financial calculations.  
2. Store network and asset information explicitly.  
3. Prevent one business from accessing another business's records.  
4. Use database transactions when updating payment records and invoice balances.  
5. Preserve transaction history instead of silently overwriting financial records.  
6. Design the schema to support partial payments and overpayments.

## **5\. API Development**

The backend should expose REST endpoints for the frontend.

The proposed endpoint structure is:

### **Authentication**

* POST /api/v1/auth/register  
* POST /api/v1/auth/login  
* GET /api/v1/auth/me

### **Businesses**

* POST /api/v1/businesses  
* GET /api/v1/businesses/me  
* PATCH /api/v1/businesses/me

### **Clients**

* POST /api/v1/clients  
* GET /api/v1/clients  
* GET /api/v1/clients/  
* PATCH /api/v1/clients/  
* DELETE /api/v1/clients/

### **Invoices**

* POST /api/v1/invoices  
* GET /api/v1/invoices  
* GET /api/v1/invoices/  
* PATCH /api/v1/invoices/  
* GET /api/v1/invoices//payments

### **Wallets**

* POST /api/v1/wallets/generate  
* GET /api/v1/wallets  
* GET /api/v1/wallets/

### **Transactions**

* GET /api/v1/transactions  
* GET /api/v1/transactions/  
* GET /api/v1/transactions/unmatched

### **Reconciliation**

* POST /api/v1/reconciliation//match  
* GET /api/v1/reconciliation/summary

### **Reports**

* GET /api/v1/reports/receivables  
* GET /api/v1/reports/payments  
* GET /api/v1/reports/overview

### **Webhooks**

* POST /api/v1/webhooks/roqqu

### **Health**

* GET /api/v1/health

These are proposed TakeFlow endpoints, not Roqqu endpoints. Adjust them to match the final frontend contract.

## **6\. Roqqu API Integration**

Roqqu is the external payment infrastructure provider.

The backend must communicate with Roqqu through a dedicated service layer. The frontend must never communicate directly with Roqqu using private API credentials.

Use the official API reference saved in `ROQQU_API_REFERENCE.md`.

### **Initially verified endpoints**

The following three endpoints have already been tested successfully in Postman:

1. POST /balances  
2. POST /wallets/generate-wallet  
3. POST /wallets/get-addresses

Implement these first where relevant, preserving their documented request formats and authentication headers.

### **Additional documented endpoints**

The following endpoints have been identified in the supplied Roqqu documentation but still require independent verification before implementation:

* GET /webhooks  
* POST /webhooks/retrigger  
* GET /transaction/deposit/  
* POST /transaction/requery/  
* GET /transaction/status/

Do not assume an endpoint is verified simply because it appears in the documentation.

### **Roqqu Integration Requirements**

1. Create a reusable Roqqu service.  
2. Keep API keys in server-side environment variables.  
3. Support staging and production configurations.  
4. Use the correct authentication header for each endpoint.  
5. Preserve the exact HTTP method, endpoint, content type and request format.  
6. Handle API failures and timeouts gracefully.  
7. Validate and normalize provider responses before saving them.  
8. Avoid exposing provider credentials or sensitive responses to frontend clients.

### **Important Integration Questions**

Before finalizing wallet and payment processing logic, establish:

* Whether wallet generation creates a unique address or reuses an existing address.  
* Whether one address can safely be associated with multiple invoices.  
* Which Roqqu webhook event represents a received wallet deposit.  
* The exact payload structure for that event.  
* The official webhook decryption algorithm.  
* The meaning of numeric transaction status values.  
* Whether transaction verification requires a separate requery operation.

Do not invent answers to these questions.

## **7\. Payment Processing and Reconciliation Workflow**

This is the most important part of TakeFlow.

The intended workflow is:

1. A business creates an invoice.  
2. The backend stores the invoice.  
3. The backend requests a receiving wallet or address from Roqqu.  
4. The receiving address and payment instructions are associated with the invoice, subject to the verified address-assignment strategy.  
5. The client sends cryptocurrency.  
6. Roqqu notifies TakeFlow through a webhook when the relevant event occurs.  
7. TakeFlow receives the webhook.  
8. The backend decrypts and validates the notification using Roqqu's documented process.  
9. The event is recorded and checked for duplicate processing.  
10. TakeFlow verifies the transaction using the appropriate Roqqu transaction endpoint.  
11. The transaction is saved.  
12. The reconciliation service attempts to match the transaction to an invoice.  
13. The invoice's received and outstanding balances are recalculated.  
14. The invoice status is updated.

### **Reconciliation Rules**

* No payment received: PENDING.  
* Payment received below the invoice amount: PARTIALLY\_PAID.  
* Payment received equal to the invoice amount: PAID.  
* Payment received above the invoice amount: record the excess and flag as OVERPAID or requiring review.  
* Payment cannot be confidently associated with an invoice: UNMATCHED transaction.  
* Payment received after the due date: preserve the payment and record the timing; do not discard it.

The backend must not mark an invoice as paid merely because a wallet was generated or a webhook was received.

A payment must be validated before it changes an invoice's financial state.

## **8\. Webhook Processing**

Webhook handling must be reliable and idempotent.

The webhook controller should:

1. Accept the incoming request.  
2. Validate the request structure.  
3. Decrypt the body using the official Roqqu procedure.  
4. Extract the event identifier, event type and relevant transaction information.  
5. Check whether the event has already been processed.  
6. Persist the event.  
7. Verify the transaction where appropriate.  
8. Trigger payment recording and reconciliation.  
9. Record processing success or failure.

Avoid doing extensive processing inside the initial HTTP request if the provider expects a quick acknowledgement. Use a reliable processing approach appropriate to the MVP.

Do not assume payment-link webhook events are the same as wallet-deposit events. Confirm the event type and payload relevant to the chosen payment flow.

## **9\. Security and Financial Integrity**

The backend must enforce:

* Password hashing.  
* JWT authentication.  
* Business-level resource ownership checks.  
* Request validation.  
* Secure environment variable handling.  
* No API keys in frontend code.  
* No secrets committed to GitHub.  
* No sensitive credentials in logs.  
* Rate limiting on sensitive endpoints.  
* Webhook event deduplication.  
* Transaction verification before financial updates.  
* Database transactions for related financial updates.

Use `.env.example` with placeholder values only.

Never put real API keys in the PRD, implementation plan, source code, Postman collection committed to GitHub, or frontend configuration.

## **10\. Development Phases**

Development should be incremental. Each phase must be tested before proceeding.

### **Phase 0: Repository Inspection and Technical Setup**

* Read all project documentation.  
* Inspect the existing repository.  
* Identify the current stack and dependencies.  
* Check environment configuration.  
* Inspect the database setup.  
* Identify existing code that can be reused.  
* Propose the backend folder structure.  
* Identify unresolved Roqqu integration questions.

Deliverable: repository assessment and approved implementation structure.

### **Phase 1: Backend Foundation**

* Set up or verify NestJS.  
* Configure TypeScript.  
* Configure PostgreSQL and Prisma.  
* Configure environment validation.  
* Set up global validation and error handling.  
* Configure API versioning.  
* Add Swagger.  
* Add health endpoint.  
* Establish the testing structure.

Deliverable: a working backend foundation.

### **Phase 2: Authentication and Business Management**

* Implement registration. [Complete]  
* Implement login. [Complete]  
* Implement JWT authentication. [Complete]  
* Implement authenticated user retrieval. [Complete]  
* Implement business creation and retrieval. [Complete]  
* Enforce business ownership. [Complete]  

Deliverable: users can register, authenticate and create their businesses.

Phase 2 completion note (2026-11-04): User and Business models migrated to Neon
(`20261104145649_phase-2-auth-businesses`); bcryptjs password hashing; passport-jwt
guards; ownership enforced at the service/database level (`{ id, ownerId }` scoping,
404 for foreign IDs); unit + e2e + live endpoint verification all passing. No invoice,
wallet, payment or Roqqu work started.

### **Phase 3: Client and Invoice Management**

* Implement client CRUD. [Complete]  
* Implement invoice creation. [Complete]  
* Implement invoice listing and details. [Complete]  
* Implement invoice updates. [Complete]  
* Generate unique invoice numbers. [Complete]  
* Calculate outstanding balances. [Complete]  
* Implement invoice status rules. [Complete]  

Deliverable: businesses can manage clients and create receivables.

Phase 3 completion note (2026-11-04): Client and Invoice models migrated to Neon
(`20261104151111_phase-3-clients-invoices`); all money as Prisma Decimal(30,18),
outstanding always equals amount minus received; invoice numbers unique per business
(auto `INV-YYYYMMDD-XXXX`); paymentReference unique per invoice; nested routes under
`/businesses/:businessId`; cross-business client references rejected (404);
manual PAID/PARTIALLY_PAID rejected (reconciliation-only); only DRAFT invoices
deletable; client delete nulls references (SetNull). Two issues found and fixed in
verification: Prisma 7 P2002 payload shape (pre-check + race backstop instead of
meta.target parsing) and stale-port servers from ended shell sessions. No Roqqu,
wallet or payment work started.

### **Phase 4: Roqqu Integration and Wallet Management**

* Build the Roqqu service. [Complete]
* Configure staging credentials. [Complete — operator must paste keys locally]
* Integrate the verified wallet-generation endpoint. [Complete]
* Integrate address retrieval. [Complete]
* Integrate balance retrieval where required. [Complete]
* Normalize provider responses. [Complete]
* Associate receiving addresses with TakeFlow records. [Complete]
* Verify address reuse and assignment behaviour. [Complete]

Deliverable: TakeFlow can interact with Roqqu and manage receiving addresses.

Phase 4 completion note (2026-11-04): Wallet, WebhookEvent and Transaction models
migrated to Neon (`20261104174210_phase_4_wallets_webhooks_transactions`).
`RoqquService` is the only HTTP boundary: `ROQQU_ENV` selects
`x-staging-api-key` (staging) or `x-api-key` (live); form vs JSON content types
follow the reference; provider `status: fail` and transport errors map to
`RoqquError` without leaking keys. Addresses are network-level (one per
invoice), stored in `Wallet` and mirrored on `Invoice.paymentAddress`;
generation is idempotent per invoice. Webhooks: public `POST /webhooks/roqqu`,
aes-256-ctr with the first 32 chars of `ROQQU_WEBHOOK_API_KEY` and the
hex-decoded `x-api-key` IV (byte lengths validated); `event_id` idempotency plus
globally unique transaction hash; only `token_received` is processed
(`token_sent`/`token_refunded` acked as IGNORED). Deposits are verified via
`GET /transaction/deposit/:tx_hash` (field-by-field match) and
`POST /transaction/requery/:network` (documented confirmation messages) before
reconciliation. Reconciliation recomputes invoice balances from matched
transactions (idempotent), supports partial/full/overpayment, records unmatched
deposits, and never changes invoice status outside payment rules. Swagger UI at
`/api/v1/docs` (CDN HTML loading `/api/v1/docs-json`) with bearer auth; all
request DTOs, response models, enums, the shared error contract and the public
webhook contract are documented (24 schemas / 30 operations).
Verification: build, 58 unit tests, 39 e2e tests (Neon), oxlint all pass; live
health/docs/JWT/business/summary smoke tests pass. Unverified: real staging
`generate-wallet`/`balances` calls (no staging key locally), whether the staging
key decrypts staging webhooks, and live-vs-staging key interchangeability.

### **Phase 5: Webhooks and Transaction Verification**

* Verify the relevant Roqqu deposit event.  
* Implement webhook decryption.  
* Implement webhook event persistence.  
* Implement idempotency.  
* Integrate transaction lookup.  
* Integrate transaction status and requery operations where required.  
* Record verified transactions.

Deliverable: TakeFlow can receive and verify payment notifications.

### **Phase 6: Payment Reconciliation**

* Match verified transactions to invoices.  
* Support partial payments.  
* Support fully paid invoices.  
* Detect overpayments.  
* Record unmatched transactions.  
* Update invoice balances and statuses.  
* Protect against duplicate financial updates.

Deliverable: payment records automatically update the correct receivables when a reliable match exists.

### **Phase 7: Reports and Frontend Integration**

* Implement receivables summaries.  
* Implement payment history.  
* Implement outstanding balances.  
* Implement unmatched transaction views.  
* Finalize frontend-facing API responses.  
* Test the complete user journey.

Deliverable: a functional backend ready for frontend integration and demonstration.

### **Phase 8: Testing and Deployment**

* Run unit tests.  
* Run integration tests.  
* Test webhook processing.  
* Test duplicate webhook delivery.  
* Test partial payments.  
* Test overpayments.  
* Test unmatched payments.  
* Test authorization and business ownership.  
* Configure production environment variables.  
* Deploy the backend.  
* Verify production health.

Deliverable: a stable hackathon MVP.

## **11\. Testing Strategy**

Prioritize tests around financial correctness.

Important scenarios include:

1. Successful user registration and login.  
2. Unauthorized access to protected endpoints.  
3. One business attempting to access another business's invoice.  
4. Successful client and invoice creation.  
5. Wallet generation failure.  
6. Duplicate webhook delivery.  
7. Invalid or undecryptable webhook.  
8. Successful transaction verification.  
9. Partial payment.  
10. Full payment.  
11. Overpayment.  
12. Unmatched transaction.  
13. Delayed payment.  
14. Duplicate transaction hash.  
15. Roqqu API timeout or unavailable service.

Financial calculations and reconciliation rules should have automated tests.

## **12\. MVP Scope and Priorities**

The hackathon MVP must prioritize the central value proposition:

**Create an invoice, receive cryptocurrency, verify the transaction, and know exactly how much has been paid and how much is still outstanding.**

### **Must Have**

* Authentication.  
* Business management.  
* Client management.  
* Invoice creation.  
* Receiving wallet/address integration.  
* Roqqu transaction verification.  
* Webhook processing.  
* Payment records.  
* Invoice reconciliation.  
* Outstanding balance calculations.  
* Basic dashboard/reporting endpoints.

### **Should Have If Time Permits**

* Unmatched transaction review.  
* Manual transaction-to-invoice matching.  
* Webhook retrigger support.  
* More detailed payment reports.  
* Improved error and audit views.

### **Out of Scope for the Initial MVP**

* Automated withdrawals.  
* Outgoing transfers.  
* Automated refunds.  
* Fiat conversion and NGN settlement.  
* Payroll.  
* Advanced accounting integrations.  
* AI-powered financial predictions.  
* Subscription billing.  
* Mobile applications.  
* Complex approval workflows.

## **13\. Engineering Principles**

All backend development must follow these principles:

1. Build incrementally and test each phase.  
2. Keep the code modular and maintainable.  
3. Never invent external API behaviour.  
4. Prioritize financial accuracy over convenience.  
5. Use precise decimal arithmetic.  
6. Make webhook processing idempotent.  
7. Keep sensitive credentials server-side.  
8. Preserve unmatched transactions for review.  
9. Separate provider integration from business logic.  
10. Avoid unnecessary architecture and features that do not contribute to the MVP.

## **14\. Definition of MVP Completion**

The backend can be considered ready for the hackathon demonstration when:

* A user can register and authenticate.  
* A business can create and manage clients.  
* A business can create an invoice.  
* A receiving address can be associated with the invoice using a verified Roqqu flow.  
* A real or valid test payment can be detected and verified.  
* The transaction can be stored.  
* The payment can be matched to its invoice.  
* The invoice balance and status update correctly.  
* Partial and unmatched payments are handled safely.  
* Duplicate webhook events do not create duplicate payments.  
* The main frontend can consume the API.  
* The backend is deployed and accessible.

---

**Final Engineering Direction**

TakeFlow is not simply a wallet generator or a crypto payment collection tool. Its core responsibility is to help service businesses understand their receivables and reconcile the cryptocurrency payments they receive.

Every backend decision should support that responsibility.

Build the smallest reliable system that demonstrates this complete workflow before expanding into secondary features.

