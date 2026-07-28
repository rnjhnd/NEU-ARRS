# Implementation Plan: NEU Academic Record Request System (NEU-ARRS)

Welcome to the development journey of the NEU-ARRS! As an engineering mentor, I've broken down this project into highly granular, step-by-step milestones. This approach ensures we maintain strict type safety, secure authorization, and clean architecture throughout the process. 

## Phase 1: Environment & Foundation
**Goal:** Establish a robust Next.js foundation with strict typing and formatting.

- [x] **Step 1.1: Initialize Next.js** 
  - *Action:* Run `npx create-next-app@latest` ensuring App Router, TypeScript, and Tailwind CSS are enabled.
  - *Why:* The App Router offers server-centric routing and React Server Components (RSCs), which significantly reduce the client-side JavaScript bundle and improve performance. TypeScript enforces type safety, catching errors at compile time.
- [x] **Step 1.2: Linter & Formatter Setup**
  - *Action:* Configure ESLint and Prettier.
  - *Why:* Enforces consistent code style across the team and prevents bikeshedding on formatting during PR reviews.
- [x] **Step 1.3: Environment Variables**
  - *Action:* Create `.env.local` to securely store Clerk, Neon PostgreSQL, and PayMongo credentials.

## Phase 2: Database Setup & Prisma ORM
**Goal:** Model our data layer securely using Prisma and deploy it to Neon's serverless Postgres.

- [x] **Step 2.1: Initialize Prisma**
  - *Action:* Run `npx prisma init` to set up our database connection.
- [x] **Step 2.2: Define the Schema**
  - *Action:* Translate the models and enums from `spec.md` (e.g., `Request`, `DocumentType`, `RequestStatus`) into `prisma/schema.prisma`.
  - *Why:* Prisma provides type-safe database access. By defining strict enums, we prevent invalid states from ever entering our database.
- [x] **Step 2.3: Migration & Client Generation**
  - *Action:* Run `npx prisma migrate dev` to push the schema to Neon and generate the Prisma Client.
  - *Why:* Neon is serverless, meaning it scales instantly and handles connection pooling efficiently for edge deployments like Vercel.

## Phase 3: Authentication & Authorization (Clerk)
**Goal:** Secure the application using Clerk, implementing role-based access control (RBAC).

- [x] **Step 3.1: Clerk Setup**
  - *Action:* Install `@clerk/nextjs` and wrap the root layout in `<ClerkProvider>`.
- [x] **Step 3.2: Middleware Configuration**
  - *Action:* Create `middleware.ts` to protect all routes by default. Implement logic to check Clerk's User Metadata (`role: "admin"` vs `role: "student"`).
  - *Why:* Middleware runs at the Edge, blocking unauthorized users before they even hit our server infrastructure.
- [x] **Step 3.3: Server-Side Auth Utilities**
  - *Action:* Create utility functions (e.g., `requireAuth()`, `requireAdmin()`) to be used inside Server Actions.
  - *Why:* Client-side checks are easily bypassed. We must *always* re-verify the user's identity and role on the server before performing any database read/writes.

## Phase 4: Shared UI Components & Layouts
**Goal:** Build a cohesive, modern UI using Tailwind CSS and headless accessible components.

- [x] **Step 4.1: Component Library Setup**
  - *Action:* Integrate a headless UI library like `shadcn/ui` for accessible, styled base components (Buttons, Inputs, Tables).
- [x] **Step 4.2: Layouts**
  - *Action:* Design the `(student)` and `(admin)` route groups with distinct navigation layouts.
- [x] **Step 4.3: Toast Notifications**
  - *Action:* Implement a toast notification provider (like `sonner`) for visual user feedback.

## Phase 5: Student Dashboard & Request Flow
**Goal:** Enable students to view history and submit new document requests securely.

- [x] **Step 5.1: Student Dashboard UI**
  - *Action:* Build the table/list displaying the student's past requests. Fetch data directly from Prisma via Server Components.
- [x] **Step 5.2: Multi-Step Request Form**
  - *Action:* Create a client-side form with state management for Document Type -> Purpose -> Payment Method.
- [x] **Step 5.3: The `createRequest` Server Action**
  - *Action:* Implement the Server Action. It must:
    1. Authenticate the student.
    2. Validate form inputs (e.g., using `zod`).
    3. Create the Prisma record. If cash, set to `PENDING`. If online, set to `PENDING_PAYMENT` and trigger Phase 6.

## Phase 6: PayMongo Integration
**Goal:** Seamlessly handle online payments via the PayMongo Checkout API.

- [x] **Step 6.1: Checkout Session Action**
  - *Action:* Implement `createCheckoutSession`. Call PayMongo's `POST /v1/checkout_sessions` API. 
  - *Crucial detail:* Inject `requestId` and `studentId` into the PayMongo `metadata` object.
  - *Why:* The Checkout API minimizes PCI compliance risk by offloading credit card handling to PayMongo.
- [x] **Step 6.2: Webhook Route Handler**
  - *Action:* Create `app/api/webhooks/paymongo/route.ts`.
  - *Action:* Implement cryptographic signature verification using the `Paymongo-Signature` header.
  - *Action:* Listen for `checkout.session.payment.paid`, extract the `metadata`, and update the Request status to `PENDING` securely in Prisma.
  - *Why:* Webhooks are asynchronous and can be spoofed. Cryptographic verification ensures the event genuinely came from PayMongo.

## Phase 7: Admin (Registrar) Dashboard
**Goal:** Empower registrars to process the document queue efficiently.

- [x] **Step 7.1: Admin Queue UI**
  - *Action:* Build a comprehensive data table fetching all requests. Implement client-side filtering (by status, date, payment).
- [x] **Step 7.2: Status Management Action**
  - *Action:* Implement the `updateRequestStatus` Server Action. Ensure strict `requireAdmin()` authorization.
- [x] **Step 7.3: Cancellation & Bulk Processing**
  - *Action:* Add ability to cancel requests (requiring a reason) and select multiple rows to advance their status simultaneously.

## Phase 8: Polish, Testing & CI/CD
**Goal:** Ensure enterprise-grade reliability before deployment.

- [x] **Step 8.1: Test Coverage**
  - *Action:* Write tests (e.g., using Vitest) for core business logic, especially the webhook handler and role-based Server Actions.
- [x] **Step 8.2: CI Pipeline**
  - *Action:* Set up GitHub Actions to run type checking (`tsc --noEmit`), linting, and tests on every pull request.
- [x] **Step 8.3: Deployment**
  - *Action:* Deploy the application to Vercel, securely mapping all environment variables.
