// Simulated event emitter infrastructure
interface EventEmitter {
  emit(event: string, payload?: unknown): void
}

export class NotificationService {
  constructor(private emitter: EventEmitter) {}

  async sendEmail(to: string, subject: string) {
    // ... send email ...
    this.emitter.emit("notification.sent", { to, subject })
  }

  async sendSms(to: string, message: string) {
    // ... send sms ...
    this.emitter.emit("sms.sent", { to, message })
  }
}
