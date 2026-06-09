## Project Overview

The NEU Academic Record Request System is a web-based portal designed to streamline how students request official documents and how the registrar's office processes them. Documents are only available for **campus pickup** at the university registrar's office. Students may pay online via **PayMongo** (GCash, Maya, cards, bank transfer) or opt to pay in cash at the counter upon pickup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS |
| Authentication | Clerk |
| Database | Neon (Serverless PostgreSQL) |
| ORM | Prisma |
| Payment Gateway | PayMongo (Checkout API) |
| Deployment | Vercel |
| CI/CD | GitHub Actions |

---

## Core User Roles

| Role | Description |
|---|---|
| **Student** | Authenticated users who submit document requests, pay online, and track their status. |
| **Admin (Registrar)** | Authenticated staff who manage, update, and fulfill requests via the admin dashboard. |

---

## Core Features

### 1. Authentication & Authorization

- Secure login, registration, and session management via **Clerk**.
- Role-based access control using **Clerk User Metadata** (e.g., `role: "admin"` or `role: "student"`).
- Protected pages using **Clerk Middleware** to redirect unauthorized users away from the admin dashboard.
- Server-side authorization: all API routes and Server Actions must verify the Clerk `userId` and role before performing any Prisma read/write operations against the Neon database.

---

### 2. Student Dashboard

- A clean interface displaying the student's personal request history.
- Status tracking per request:
  - `Pending Payment`
  - `Pending`
  - `Processing`
  - `Ready for Pickup`
  - `Completed`
  - `Cancelled`
- A prominent **"New Request"** button to initiate a document request.
- Payment status badge per request (`Unpaid`, `Paid`, `Cash on Pickup`).

---

### 3. Document Request Flow

A multi-step form where students:

1. **Select a document type** from the following standard options:
   - Transcript of Records (TOR)
   - Certificate of Good Moral Character
   - Diploma
   - Certificate of Enrollment
2. **Specify the purpose** of the request (e.g., Employment, Board Exam, Transfer).
3. **Select a payment method**:
   - **Online Payment** — redirects to PayMongo Checkout (supports GCash, Maya, credit/debit cards, bank transfer via InstaPay/PESONet)
   - **Cash** — pay at the registrar's counter upon pickup; request proceeds to `Pending` status immediately
4. **For online payments**: student is redirected to the PayMongo-hosted checkout page. On success, they are redirected back to the portal; on failure or cancellation, they are returned to the request form.
5. **Note:** All documents are for **campus pickup only**. No courier or delivery option is available.

---

### 4. Admin (Registrar) Dashboard

- A centralized data table displaying all incoming and historical requests.
- **Filtering and sorting** capabilities:
  - By date (newest/oldest)
  - By student name
  - By current status
  - By payment status (`Paid` / `Unpaid` / `Cash on Pickup`)
- An interface to **update the status** of a specific request, which immediately reflects on the student's dashboard.
- Visibility into payment confirmation details (PayMongo payment ID, payment method used, amount paid).

---

### 5. System Notifications

- Automated status update notifications when a request's status changes.
- Visual toast notifications for user actions (e.g., request submitted, payment confirmed, status updated).
- On successful PayMongo payment, the system automatically moves the request from `Pending Payment` → `Pending` and notifies the student.

---

### 6. Document Processing Queue & Logic (Admin)

#### Queue Management

- The main admin view defaults to a queue of **Pending** requests (i.e., paid or cash-on-pickup requests awaiting processing).
- Requests in `Pending Payment` status are shown in a separate **Awaiting Payment** queue and are not actioned by the registrar until payment is confirmed.

#### Bulk Processing

- Checkbox selection to update the status of **multiple requests simultaneously**.

#### Internal Status System

| Status | Description |
|---|---|
| **Pending Payment** | Student submitted the request but has not completed online payment yet. |
| **Pending** | Payment confirmed (or cash selected); request is queued for processing. |
| **Processing** | Registrar is actively working on it (pulling/printing documents). |
| **Ready for Pickup** | Document is printed and waiting at the registrar's counter. |
| **Completed** | Request finalized; student has collected the document. |
| **Cancelled** | Request was cancelled by the student or admin; a cancellation reason must be recorded. |

---

### 7. Payment Integration (PayMongo)

#### Gateway Choice

**PayMongo** is the recommended payment gateway for this system. It is PH-based, developer-friendly, supports GCash, Maya, QR Ph, credit/debit cards, InstaPay, and PESONet — all under one unified API — and integrates cleanly with Next.js and Vercel.

#### Integration Approach: Checkout API

Use the **PayMongo Checkout API** (hosted checkout session) to minimize PCI compliance scope and reduce implementation complexity. The student is redirected to a PayMongo-hosted page to complete payment.

#### Payment Flow & Metadata Handling


```

[Student selects "Online Payment"]
│
▼
[Server Action: createCheckoutSession]

* Calls POST /v1/checkout_sessions
* Sets amount, description, payment methods
* Sets success_url and cancel_url back to the portal
* CRITICAL: Passes `requestId` and `studentId` in the `metadata` object of the PayMongo payload.
│
▼
[Student redirected to PayMongo Checkout Page]
│
┌─────┴──────┐
Paid        Cancelled/Failed
│              │
▼              ▼
[success_url]   [cancel_url]
[Webhook fires] [Request stays "Pending Payment"]
│
▼
[Webhook Handler: POST /api/webhooks/paymongo]
* Verifies webhook signature
* On checkout.session.payment.paid:
→ Extracts `metadata.requestId` from the PayMongo session object.
→ Updates Request paymentStatus = "PAID"
→ Updates Request status = "PENDING"
→ Stores paymongoPaymentId, paymentMethod

```

#### Webhook Handling

- Create a **Next.js Route Handler** at `app/api/webhooks/paymongo/route.ts`.
- Verify the `Paymongo-Signature` header using the webhook secret key before processing any event.
- Handle the `checkout.session.payment.paid` event to confirm payment and advance the request status.
- Return `200 OK` immediately to acknowledge receipt; process logic asynchronously if needed.
- Log all incoming webhook events for debugging.

---

### 8. Backend & Data Layer

#### Database Schema (Prisma)

```prisma
enum DocumentType {
  TOR
  GOOD_MORAL
  DIPLOMA
  ENROLLMENT
}

enum RequestStatus {
  PENDING_PAYMENT
  PENDING
  PROCESSING
  READY_FOR_PICKUP
  COMPLETED
  CANCELLED
}

enum PaymentStatus {
  UNPAID
  PAID
  CASH_ON_PICKUP
}

enum Purpose {
  EMPLOYMENT
  BOARD_EXAM
  TRANSFER
  SCHOLARSHIP
  PERSONAL
  OTHER
}

model Request {
  id                  String         @id @default(cuid())
  studentId           String         // Clerk userId
  documentType        DocumentType
  purpose             Purpose
  paymentMethod       String         // "online" | "cash"
  paymentStatus       PaymentStatus  @default(UNPAID)
  paymongoCheckoutId  String?        // PayMongo checkout session ID
  paymongoPaymentId   String?        // PayMongo payment ID (from webhook)
  paymongoPaymentType String?        // e.g., "gcash", "maya", "card", "qrph"
  amountPaid          Int?           // Amount in centavos (e.g., 15000 = ₱150.00)
  status              RequestStatus  @default(PENDING_PAYMENT)
  cancelReason        String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  @@index([studentId])
  @@index([status])
  @@index([paymentStatus])
}

```

#### Environment Variables

Add the following to `.env.local` and Vercel project settings:

```env
# PayMongo
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_PUBLIC_KEY=pk_test_...
PAYMONGO_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

```

#### Server Actions

Implement typed Server Actions for all request mutations:

* **`createRequest`** — validates input; if `paymentMethod === "cash"`, creates request with `status: PENDING` and `paymentStatus: CASH_ON_PICKUP`; if `paymentMethod === "online"`, creates request with `status: PENDING_PAYMENT` and calls `createCheckoutSession`.
* **`createCheckoutSession`** — calls PayMongo `POST /v1/checkout_sessions`, strictly including the Prisma `Request.id` in the `metadata` object. Stores the `paymongoCheckoutId`, returns the checkout URL for redirect.
* **`updateRequestStatus`** — updates one or many request statuses; enforces business rules.
* **`cancelRequest`** — sets status to `CANCELLED` with a `cancelReason`; only allowed if current status is `PENDING_PAYMENT`, `PENDING`, or `PROCESSING`.
* **`cleanupPendingPayments`** — chron job or admin action to cancel requests stuck in `PENDING_PAYMENT` for more than 24 hours.

#### Error Handling

* Graceful handling of database errors (connection issues, constraint violations) via try/catch in all Server Actions.
* Clerk authentication checks must be verified at the top of every Server Action and API route before any database operation is performed.
* PayMongo API errors (e.g., invalid keys, network failures) must be caught and returned as typed error responses.
* Return typed error responses (e.g., `{ success: false, error: string }`) to the client for all failure states.

---

## Status Flow Diagram

```
[Student Submits — Online Payment]        [Student Submits — Cash]
          │                                         │
          ▼                                         ▼
  PENDING PAYMENT  ──────────────────────────►  CANCELLED
  (awaiting PayMongo)   (student cancels or 24hr timeout)
          │
  [PayMongo Webhook: paid]
          │
          ▼
      PENDING  ─────────────────────────────►  CANCELLED
          │                                  (admin, with reason)
          ▼
    PROCESSING  ───────────────────────────►  CANCELLED
          │                                  (admin, with reason)
          ▼
  READY FOR PICKUP
          │
          ▼
      COMPLETED

```

---

## CI/CD & Deployment Notes

* **Vercel** handles preview deployments on pull requests and production on `main` branch merge.
* **GitHub Actions** runs lint, type checks, and Prisma schema validation on every push.
* Register the PayMongo webhook endpoint in the PayMongo dashboard:
* URL: `https://your-domain.vercel.app/api/webhooks/paymongo`
* Events: `checkout.session.payment.paid`


* Environment variables (`DATABASE_URL`, `CLERK_SECRET_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, etc.) are managed via Vercel's environment variable settings and are never committed to the repository.
* Use separate PayMongo test/live key pairs per environment (development, staging, production).