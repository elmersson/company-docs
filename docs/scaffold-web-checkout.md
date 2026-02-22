# Scaffold: web-checkout (Frontend)

**Repo:** `elmersson/web-checkout`
**Purpose:** Pilot frontend repo for the automated documentation system. Must contain real React + TypeScript patterns with fetch/axios API calls that the `@company/docs-extractor` can statically analyze.

---

## Objective

Create a realistic React + TypeScript loan checkout UI. The code does NOT need to render in a browser or be deployed — it needs to be **structurally correct TypeScript** that the ts-morph static analyzer can parse. All patterns below are specifically chosen to exercise the documentation extractor's frontend API call detection.

---

## Required Project Structure

```
web-checkout/
├── package.json
├── tsconfig.json
├── src/
│   ├── api/
│   │   ├── client.ts                 # Axios instance with baseURL
│   │   ├── loan.api.ts              # Loan API calls (fetch + axios patterns)
│   │   └── payment.api.ts           # Payment API calls
│   ├── services/
│   │   └── loan.service.ts          # Higher-level service wrapping API calls
│   ├── types/
│   │   ├── loan.types.ts            # Loan DTOs (mirrors backend)
│   │   └── payment.types.ts         # Payment DTOs (mirrors backend)
│   ├── components/
│   │   ├── LoanApplication.tsx      # Form component (uses API)
│   │   ├── LoanDetail.tsx           # Detail view component
│   │   ├── PaymentForm.tsx          # Payment form component
│   │   └── LoanList.tsx             # List component
│   ├── hooks/
│   │   ├── useLoan.ts               # Custom hook for loan operations
│   │   └── usePayments.ts           # Custom hook for payments
│   └── App.tsx                      # Root component
└── README.md
```

---

## Critical Patterns to Include

The documentation extractor uses ts-morph to detect specific code patterns. Every pattern below MUST appear in the codebase exactly as described.

### 1. Frontend API Call Patterns (detected by `frontend-api-calls.ts` extractor)

API calls must be in `src/api/**/*.ts` or `src/services/**/*.ts` (matching the registry globs).

**File: `src/api/client.ts`**

```typescript
import axios from "axios"

// Pattern 3: Axios instance with baseURL
export const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
})
```

**File: `src/api/loan.api.ts`**

Must include ALL of these patterns:

```typescript
import { api } from "./client"
import type {
  LoanApplicationDto,
  LoanResultDto,
  LoanDetailDto,
  UpdateLoanDto,
} from "../types/loan.types"

// Pattern 1: fetch() with method in options
export async function applyForLoanFetch(data: LoanApplicationDto): Promise<LoanResultDto> {
  const response = await fetch("/api/v1/loans/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return response.json()
}

// Pattern 1: fetch() with GET (default method)
export async function getLoansListFetch(): Promise<LoanDetailDto[]> {
  const response = await fetch("/api/v1/loans")
  return response.json()
}

// Pattern 2: axios.METHOD() with generic type
export async function applyForLoan(data: LoanApplicationDto): Promise<LoanResultDto> {
  const response = await api.post<LoanResultDto>("/loans/apply", data)
  return response.data
}

// Pattern 3: axios instance .get with generic
export async function getLoans(): Promise<LoanDetailDto[]> {
  const response = await api.get<LoanDetailDto[]>("/loans")
  return response.data
}

// Pattern 3: axios instance .get with path param
export async function getLoanById(id: string): Promise<LoanDetailDto> {
  const response = await api.get<LoanDetailDto>(`/loans/${id}`)
  return response.data
}

// Pattern 3: axios instance .put
export async function updateLoan(id: string, data: UpdateLoanDto): Promise<LoanDetailDto> {
  const response = await api.put<LoanDetailDto>(`/loans/${id}`, data)
  return response.data
}

// Pattern 3: axios instance .delete
export async function deleteLoan(id: string): Promise<void> {
  await api.delete(`/loans/${id}`)
}
```

**File: `src/api/payment.api.ts`**

```typescript
import { api } from "./client"
import type {
  CreatePaymentDto,
  PaymentDto,
  PaymentSummaryDto,
} from "../types/payment.types"

// Pattern 2/3: axios instance calls
export async function makePayment(loanId: string, data: CreatePaymentDto): Promise<PaymentDto> {
  const response = await api.post<PaymentDto>(`/loans/${loanId}/payments`, data)
  return response.data
}

export async function getPayments(loanId: string): Promise<PaymentDto[]> {
  const response = await api.get<PaymentDto[]>(`/loans/${loanId}/payments`)
  return response.data
}

export async function getPayment(loanId: string, paymentId: string): Promise<PaymentDto> {
  const response = await api.get<PaymentDto>(`/loans/${loanId}/payments/${paymentId}`)
  return response.data
}

// Pattern 1: fetch() for summary
export async function getPaymentSummary(loanId: string): Promise<PaymentSummaryDto> {
  const response = await fetch(`/api/v1/loans/${loanId}/payments/summary`)
  return response.json()
}
```

**File: `src/services/loan.service.ts`**

```typescript
import { api } from "../api/client"
import type { LoanDetailDto, LoanApplicationDto, LoanResultDto } from "../types/loan.types"

// Pattern 4: Custom wrapper functions calling axios
export async function submitLoanApplication(data: LoanApplicationDto): Promise<LoanResultDto> {
  const response = await api.post<LoanResultDto>("/loans/apply", data)
  return response.data
}

export async function fetchActiveLoansByStatus(status: string): Promise<LoanDetailDto[]> {
  const response = await api.get<LoanDetailDto[]>("/loans", {
    params: { status },
  })
  return response.data
}

// Pattern 1: fetch with DELETE
export async function cancelLoanApplication(loanId: string): Promise<void> {
  await fetch(`/api/v1/loans/${loanId}`, {
    method: "DELETE",
  })
}
```

### 2. DTO / Type Patterns (detected by `dto-models.ts` extractor)

Types must be in `src/types/**/*.ts` (matching the registry glob).

**File: `src/types/loan.types.ts`**

```typescript
// These types mirror the backend DTOs — the extractor detects
// when frontend and backend types diverge.

export enum EmploymentStatus {
  EMPLOYED = "EMPLOYED",
  SELF_EMPLOYED = "SELF_EMPLOYED",
  UNEMPLOYED = "UNEMPLOYED",
  RETIRED = "RETIRED",
  STUDENT = "STUDENT",
}

export enum LoanStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  ACTIVE = "ACTIVE",
  PAID_OFF = "PAID_OFF",
  DEFAULTED = "DEFAULTED",
}

export interface LoanApplicationDto {
  amount: number
  termMonths: number
  employmentStatus: EmploymentStatus
  applicantName: string
  applicantEmail: string
  annualIncome: number
  notes?: string
}

export type LoanResultDto = {
  approved: boolean
  loanId: string
  interestRate: number
  monthlyPayment: number
  rejectionReason?: string
}

export interface LoanDetailDto {
  id: string
  amount: number
  termMonths: number
  interestRate: number
  status: LoanStatus
  applicantName: string
  applicantEmail: string
  employmentStatus: EmploymentStatus
  createdAt: string
  updatedAt: string
}

export interface UpdateLoanDto {
  amount?: number
  termMonths?: number
  employmentStatus?: EmploymentStatus
  notes?: string
}
```

**File: `src/types/payment.types.ts`**

```typescript
export enum PaymentMethod {
  BANK_TRANSFER = "BANK_TRANSFER",
  CREDIT_CARD = "CREDIT_CARD",
  DIRECT_DEBIT = "DIRECT_DEBIT",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface CreatePaymentDto {
  amount: number
  method: PaymentMethod
  reference?: string
}

export interface PaymentDto {
  id: string
  loanId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  processedAt: string
  reference?: string
}

export type PaymentSummaryDto = {
  totalPaid: number
  remainingBalance: number
  nextPaymentDue: string
  paymentCount: number
}
```

### 3. React Components (not directly extracted, but make the repo realistic)

Components use the API functions, making the dependency graph visible.

**File: `src/App.tsx`**

```tsx
import React from "react"
import { LoanApplication } from "./components/LoanApplication"
import { LoanList } from "./components/LoanList"

export default function App() {
  return (
    <div>
      <h1>Loan Checkout</h1>
      <LoanList />
      <LoanApplication />
    </div>
  )
}
```

**File: `src/components/LoanApplication.tsx`**

```tsx
import React, { useState } from "react"
import { applyForLoan } from "../api/loan.api"
import type { LoanApplicationDto, LoanResultDto } from "../types/loan.types"
import { EmploymentStatus } from "../types/loan.types"

export function LoanApplication() {
  const [result, setResult] = useState<LoanResultDto | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const application: LoanApplicationDto = {
      amount: 10000,
      termMonths: 12,
      employmentStatus: EmploymentStatus.EMPLOYED,
      applicantName: "John Doe",
      applicantEmail: "john@example.com",
      annualIncome: 60000,
    }

    const res = await applyForLoan(application)
    setResult(res)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Apply for Loan</h2>
      {/* Form fields would go here */}
      <button type="submit">Submit Application</button>
      {result && (
        <div>
          {result.approved ? (
            <p>Approved! Loan ID: {result.loanId}</p>
          ) : (
            <p>Rejected: {result.rejectionReason}</p>
          )}
        </div>
      )}
    </form>
  )
}
```

**File: `src/components/LoanList.tsx`**

```tsx
import React, { useEffect, useState } from "react"
import { getLoans } from "../api/loan.api"
import type { LoanDetailDto } from "../types/loan.types"

export function LoanList() {
  const [loans, setLoans] = useState<LoanDetailDto[]>([])

  useEffect(() => {
    getLoans().then(setLoans)
  }, [])

  return (
    <div>
      <h2>Your Loans</h2>
      <ul>
        {loans.map((loan) => (
          <li key={loan.id}>
            {loan.applicantName} - ${loan.amount} ({loan.status})
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**File: `src/components/LoanDetail.tsx`**

```tsx
import React, { useEffect, useState } from "react"
import { getLoanById, deleteLoan } from "../api/loan.api"
import type { LoanDetailDto } from "../types/loan.types"

export function LoanDetail({ loanId }: { loanId: string }) {
  const [loan, setLoan] = useState<LoanDetailDto | null>(null)

  useEffect(() => {
    getLoanById(loanId).then(setLoan)
  }, [loanId])

  const handleDelete = async () => {
    await deleteLoan(loanId)
  }

  if (!loan) return <div>Loading...</div>

  return (
    <div>
      <h2>Loan Detail</h2>
      <p>Amount: ${loan.amount}</p>
      <p>Status: {loan.status}</p>
      <p>Rate: {loan.interestRate}%</p>
      <button onClick={handleDelete}>Cancel Loan</button>
    </div>
  )
}
```

**File: `src/components/PaymentForm.tsx`**

```tsx
import React, { useState } from "react"
import { makePayment } from "../api/payment.api"
import type { CreatePaymentDto, PaymentDto } from "../types/payment.types"
import { PaymentMethod } from "../types/payment.types"

export function PaymentForm({ loanId }: { loanId: string }) {
  const [payment, setPayment] = useState<PaymentDto | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: CreatePaymentDto = {
      amount: 500,
      method: PaymentMethod.BANK_TRANSFER,
    }

    const result = await makePayment(loanId, data)
    setPayment(result)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Make Payment</h3>
      <button type="submit">Pay $500</button>
      {payment && <p>Payment {payment.id} processed</p>}
    </form>
  )
}
```

### 4. Custom Hooks (not directly extracted, but add realistic patterns)

**File: `src/hooks/useLoan.ts`**

```typescript
import { useState, useEffect } from "react"
import { getLoanById, updateLoan, deleteLoan } from "../api/loan.api"
import type { LoanDetailDto, UpdateLoanDto } from "../types/loan.types"

export function useLoan(loanId: string) {
  const [loan, setLoan] = useState<LoanDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getLoanById(loanId)
      .then(setLoan)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [loanId])

  const update = async (data: UpdateLoanDto) => {
    const updated = await updateLoan(loanId, data)
    setLoan(updated)
    return updated
  }

  const remove = async () => {
    await deleteLoan(loanId)
    setLoan(null)
  }

  return { loan, loading, error, update, remove }
}
```

**File: `src/hooks/usePayments.ts`**

```typescript
import { useState, useEffect } from "react"
import { getPayments, makePayment } from "../api/payment.api"
import type { PaymentDto, CreatePaymentDto } from "../types/payment.types"

export function usePayments(loanId: string) {
  const [payments, setPayments] = useState<PaymentDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getPayments(loanId)
      .then(setPayments)
      .finally(() => setLoading(false))
  }, [loanId])

  const pay = async (data: CreatePaymentDto) => {
    const payment = await makePayment(loanId, data)
    setPayments((prev) => [...prev, payment])
    return payment
  }

  return { payments, loading, pay }
}
```

---

## Configuration Files

### `package.json`

```json
{
  "name": "web-checkout",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "vite",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Verification Checklist

After scaffolding, verify:

```
[ ] tsconfig.json exists at root with "jsx": "react-jsx"
[ ] package.json has "type": "module"
[ ] npm install / pnpm install succeeds
[ ] tsc --noEmit passes with no errors
[ ] API calls exist at src/api/**/*.ts using fetch() and axios instance methods
[ ] Service wrappers exist at src/services/**/*.ts calling API functions
[ ] Types exist at src/types/**/*.ts as exported interfaces, type aliases, and enums
[ ] Types mirror the backend DTOs (same field names and types)
[ ] fetch() calls use string literal URLs like "/api/v1/loans/apply"
[ ] axios calls use api.get/post/put/delete with string literal paths
[ ] axios calls include generic type parameters like api.get<LoanDetailDto[]>(...)
[ ] All imports resolve (no broken import paths)
```

---

## What NOT to Do

- Do NOT add a real dev server or build pipeline — the extractor uses static analysis only
- Do NOT add tests — this repo is a fixture for the doc system
- Do NOT use Next.js, Vue, Angular, or other frameworks — the extractor only supports React patterns
- Do NOT use JavaScript files — everything must be TypeScript (.ts/.tsx)
- Do NOT use `require()` — use ESM imports only
- Do NOT put API call functions inside component files — they must be in separate files matching `src/api/**/*.ts` or `src/services/**/*.ts`
- Do NOT use dynamic URL construction like `` `${BASE_URL}/loans` `` for the base path — use string literals for the URL argument to fetch/axios so the extractor can detect them
- Do NOT use `export default` for interfaces/types — use named exports
- Do NOT remove types that exist on the backend — the system detects frontend/backend drift
