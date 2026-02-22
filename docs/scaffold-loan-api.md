# Scaffold: loan-api (Backend)

**Repo:** `elmersson/loan-api`
**Purpose:** Pilot backend repo for the automated documentation system. Must contain real Express.js + TypeScript patterns that the `@company/docs-extractor` can statically analyze.

---

## Objective

Create a realistic Express.js + TypeScript + Prisma loan application API. The code does NOT need to run against a real database or be deployed — it needs to be **structurally correct TypeScript** that the ts-morph static analyzer can parse. All patterns below are specifically chosen to exercise the documentation extractor.

---

## Required Project Structure

```
loan-api/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app.ts                        # Express app setup + route mounting
│   ├── routes/
│   │   ├── loan.routes.ts            # Loan CRUD + application routes
│   │   ├── payment.routes.ts         # Payment routes
│   │   └── health.routes.ts          # Health check
│   ├── controllers/
│   │   ├── loan.controller.ts        # Loan handlers
│   │   └── payment.controller.ts     # Payment handlers
│   ├── dto/
│   │   ├── loan.dto.ts               # Loan request/response DTOs
│   │   └── payment.dto.ts            # Payment DTOs
│   ├── models/
│   │   └── enums.ts                  # Shared enums (EmploymentStatus, LoanStatus, etc.)
│   ├── events/
│   │   ├── event-bus.ts              # Simple EventBus class with publish/emit methods
│   │   └── loan.events.ts           # Loan domain events
│   └── middleware/
│       ├── auth.ts                   # Auth middleware stub
│       └── validate.ts              # Validation middleware stub
└── README.md
```

---

## Critical Patterns to Include

The documentation extractor uses ts-morph to detect specific code patterns. Every pattern below MUST appear in the codebase exactly as described, or the extractor will miss it.

### 1. Express Route Patterns (detected by `express-routes.ts` extractor)

All routes must be defined in `src/routes/*.ts` files (matching `src/routes/**/*.ts` glob).

**File: `src/routes/loan.routes.ts`**

Must include ALL of these patterns:

```typescript
import { Router } from "express"
import { LoanController } from "../controllers/loan.controller"
import { auth } from "../middleware/auth"
import { validate } from "../middleware/validate"
import { CreateLoanSchema, UpdateLoanSchema } from "../dto/loan.dto"

const router = Router()
const controller = new LoanController()

// Pattern 1: router.METHOD(path, handler)
router.get("/loans", controller.listLoans)

// Pattern 2: router.METHOD(path, ...middleware, handler)
router.post("/loans/apply", auth, validate(CreateLoanSchema), controller.applyForLoan)

// Pattern 3: router.METHOD with multiple middleware
router.put("/loans/:id", auth, validate(UpdateLoanSchema), controller.updateLoan)

// Pattern 4: Simple handler
router.get("/loans/:id", controller.getLoanById)

// Pattern 5: Delete route
router.delete("/loans/:id", auth, controller.deleteLoan)

export default router
```

**File: `src/routes/payment.routes.ts`**

```typescript
import { Router } from "express"
import { PaymentController } from "../controllers/payment.controller"
import { auth } from "../middleware/auth"

const router = Router()
const controller = new PaymentController()

router.post("/loans/:loanId/payments", auth, controller.makePayment)
router.get("/loans/:loanId/payments", controller.listPayments)
router.get("/loans/:loanId/payments/:paymentId", controller.getPayment)

export default router
```

**File: `src/routes/health.routes.ts`**

```typescript
import { Router } from "express"

const router = Router()

// Pattern 3: Inline arrow handler
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

export default router
```

**File: `src/app.ts`**

```typescript
import express from "express"
import loanRouter from "./routes/loan.routes"
import paymentRouter from "./routes/payment.routes"
import healthRouter from "./routes/health.routes"

const app = express()

app.use(express.json())

// Pattern 5: Mounted sub-routers with prefix
app.use("/api/v1", loanRouter)
app.use("/api/v1", paymentRouter)
app.use("/api", healthRouter)

export default app
```

### 2. DTO / Interface Patterns (detected by `dto-models.ts` extractor)

All DTOs must be in `src/dto/**/*.ts` or `src/models/**/*.ts` (matching the registry globs).

**File: `src/dto/loan.dto.ts`**

Must include ALL of these patterns:

```typescript
import { EmploymentStatus, LoanStatus } from "../models/enums"

// Pattern 1: Exported interface with required and optional fields
export interface LoanApplicationDto {
  amount: number
  termMonths: number
  employmentStatus: EmploymentStatus
  applicantName: string
  applicantEmail: string
  annualIncome: number
  notes?: string
}

// Pattern 2: Exported type alias
export type LoanResultDto = {
  approved: boolean
  loanId: string
  interestRate: number
  monthlyPayment: number
  rejectionReason?: string
}

// Pattern 3: Another exported interface
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

// Pattern: Exported interface used as update DTO (partial)
export interface UpdateLoanDto {
  amount?: number
  termMonths?: number
  employmentStatus?: EmploymentStatus
  notes?: string
}

// Validation schemas (non-extractable as DTOs, but referenced by routes)
export const CreateLoanSchema = {} as any
export const UpdateLoanSchema = {} as any
```

**File: `src/dto/payment.dto.ts`**

```typescript
import { PaymentMethod, PaymentStatus } from "../models/enums"

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

**File: `src/models/enums.ts`**

```typescript
// Pattern 3: Exported enums
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
```

### 3. Event Patterns (detected by `events.ts` extractor)

Events must be in `src/events/**/*.ts` (matching the registry glob).

**File: `src/events/event-bus.ts`**

```typescript
export class EventBus {
  publish(event: object): void {
    // Stub — in production this would go to a message queue
    console.log(`Event published: ${event.constructor.name}`)
  }

  emit(eventName: string, payload: object): void {
    // Stub — string-based event emission
    console.log(`Event emitted: ${eventName}`, payload)
  }
}

export const eventBus = new EventBus()
```

**File: `src/events/loan.events.ts`**

Must include ALL of these patterns:

```typescript
import { eventBus } from "./event-bus"

// Event classes
export class LoanCreatedEvent {
  constructor(
    public readonly loanId: string,
    public readonly applicantName: string,
    public readonly amount: number,
  ) {}
}

export class LoanApprovedEvent {
  constructor(
    public readonly loanId: string,
    public readonly interestRate: number,
  ) {}
}

export class LoanRejectedEvent {
  constructor(
    public readonly loanId: string,
    public readonly reason: string,
  ) {}
}

export class PaymentReceivedEvent {
  constructor(
    public readonly loanId: string,
    public readonly paymentId: string,
    public readonly amount: number,
  ) {}
}

// Pattern 1: Publish with new EventClass()
export function publishLoanCreated(loanId: string, name: string, amount: number) {
  eventBus.publish(new LoanCreatedEvent(loanId, name, amount))
}

export function publishLoanApproved(loanId: string, rate: number) {
  eventBus.publish(new LoanApprovedEvent(loanId, rate))
}

export function publishLoanRejected(loanId: string, reason: string) {
  eventBus.publish(new LoanRejectedEvent(loanId, reason))
}

// Pattern 2: Emit with string event name
export function emitPaymentReceived(loanId: string, paymentId: string, amount: number) {
  eventBus.emit("payment.received", { loanId, paymentId, amount })
}
```

### 4. Prisma Schema (detected by `prisma-schema.ts` extractor)

Must be at `prisma/schema.prisma` (matching the registry path).

**File: `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model LoanApplication {
  id                String   @id @default(uuid())
  amount            Float
  termMonths        Int
  interestRate      Float?
  status            String   @default("PENDING")
  employmentStatus  String
  applicantName     String
  applicantEmail    String
  annualIncome      Float
  notes             String?
  rejectionReason   String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  payments          Payment[]
}

model Payment {
  id          String   @id @default(uuid())
  loanId      String
  loan        LoanApplication @relation(fields: [loanId], references: [id])
  amount      Float
  method      String
  status      String   @default("PENDING")
  reference   String?
  processedAt DateTime @default(now())
}
```

### 5. Controllers (not directly extracted, but referenced by routes)

**File: `src/controllers/loan.controller.ts`**

```typescript
import { Request, Response } from "express"
import type { LoanApplicationDto, LoanResultDto, LoanDetailDto, UpdateLoanDto } from "../dto/loan.dto"
import { publishLoanCreated, publishLoanApproved, publishLoanRejected } from "../events/loan.events"

export class LoanController {
  async listLoans(req: Request, res: Response<LoanDetailDto[]>): Promise<void> {
    // Stub implementation
    res.json([])
  }

  async applyForLoan(req: Request<{}, LoanResultDto, LoanApplicationDto>, res: Response<LoanResultDto>): Promise<void> {
    const dto = req.body
    const loanId = "generated-id"

    publishLoanCreated(loanId, dto.applicantName, dto.amount)

    // Stub: always approve
    publishLoanApproved(loanId, 5.5)

    res.status(201).json({
      approved: true,
      loanId,
      interestRate: 5.5,
      monthlyPayment: dto.amount / dto.termMonths,
    })
  }

  async getLoanById(req: Request<{ id: string }>, res: Response<LoanDetailDto>): Promise<void> {
    res.status(404).json({} as any)
  }

  async updateLoan(req: Request<{ id: string }, LoanDetailDto, UpdateLoanDto>, res: Response<LoanDetailDto>): Promise<void> {
    res.json({} as any)
  }

  async deleteLoan(req: Request<{ id: string }>, res: Response): Promise<void> {
    res.sendStatus(204)
  }
}
```

**File: `src/controllers/payment.controller.ts`**

```typescript
import { Request, Response } from "express"
import type { CreatePaymentDto, PaymentDto } from "../dto/payment.dto"
import { emitPaymentReceived } from "../events/loan.events"

export class PaymentController {
  async makePayment(req: Request<{ loanId: string }, PaymentDto, CreatePaymentDto>, res: Response<PaymentDto>): Promise<void> {
    const { loanId } = req.params
    const paymentId = "generated-payment-id"

    emitPaymentReceived(loanId, paymentId, req.body.amount)

    res.status(201).json({} as any)
  }

  async listPayments(req: Request<{ loanId: string }>, res: Response<PaymentDto[]>): Promise<void> {
    res.json([])
  }

  async getPayment(req: Request<{ loanId: string; paymentId: string }>, res: Response<PaymentDto>): Promise<void> {
    res.status(404).json({} as any)
  }
}
```

### 6. Middleware Stubs (referenced by routes)

**File: `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from "express"

export function auth(req: Request, res: Response, next: NextFunction): void {
  // Stub — accept all requests
  next()
}
```

**File: `src/middleware/validate.ts`**

```typescript
import { Request, Response, NextFunction } from "express"

export function validate(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Stub — skip validation
    next()
  }
}
```

---

## Configuration Files

### `package.json`

```json
{
  "name": "loan-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/app.ts",
    "start": "node dist/app.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "prisma": "^6.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Verification Checklist

After scaffolding, verify:

```
[ ] tsconfig.json exists at root
[ ] package.json has "type": "module"
[ ] npm install / pnpm install succeeds
[ ] tsc --noEmit passes with no errors
[ ] Routes exist at src/routes/**/*.ts using Router() with .get/.post/.put/.delete
[ ] DTOs exist at src/dto/**/*.ts as exported interfaces and type aliases
[ ] Enums exist at src/models/**/*.ts as exported enums
[ ] Events exist at src/events/**/*.ts with .publish(new Event()) and .emit("name") calls
[ ] Prisma schema exists at prisma/schema.prisma with at least 2 models
[ ] Middleware referenced in routes is importable from src/middleware/
[ ] All imports resolve (no broken import paths)
```

---

## What NOT to Do

- Do NOT add a real database connection — the extractor uses static analysis only
- Do NOT add tests — this repo is a fixture for the doc system, not a production app
- Do NOT use NestJS, Fastify, or other frameworks — the extractor only supports Express
- Do NOT use JavaScript files — everything must be TypeScript
- Do NOT use `require()` — use ESM imports only
- Do NOT put DTOs inside route files — they must be in separate files matching the glob patterns
- Do NOT use dynamic route paths like `` `/loan/${id}` `` — use string literals like `"/loans/:id"`
- Do NOT use `export default` for interfaces/types — use named exports
