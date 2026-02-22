// Simulated event bus infrastructure
interface EventBus {
  publish(event: unknown): void
}

export class LoanCreatedEvent {
  constructor(public readonly payload: { loanId: string; amount: number }) {}
}

export class LoanApprovedEvent {
  constructor(public readonly payload: { loanId: string }) {}
}

// Usage in service
export class LoanService {
  constructor(private eventBus: EventBus) {}

  async createLoan(data: any) {
    // ... business logic ...
    this.eventBus.publish(new LoanCreatedEvent({ loanId: "123", amount: 5000 }))
  }

  async approveLoan(loanId: string) {
    // ... business logic ...
    this.eventBus.publish(new LoanApprovedEvent({ loanId }))
  }
}
