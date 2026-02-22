import { describe, it, expect } from "vitest"
import { extractEvents } from "../src/extractors/events.js"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

describe("Event Extractor", () => {
  it("detects class-based events via publish(new EventClass())", () => {
    const events = extractEvents(FIXTURE_PATH, [
      "src/events/loan.events.ts",
    ])

    const loanCreated = events.find((e) => e.name === "LoanCreatedEvent")
    expect(loanCreated).toBeDefined()
    expect(loanCreated!.sourceFile).toContain("loan.events.ts")
  })

  it("detects multiple events from same file", () => {
    const events = extractEvents(FIXTURE_PATH, [
      "src/events/loan.events.ts",
    ])

    const loanApproved = events.find((e) => e.name === "LoanApprovedEvent")
    expect(loanApproved).toBeDefined()

    // Should have at least LoanCreatedEvent and LoanApprovedEvent
    expect(events.length).toBeGreaterThanOrEqual(2)
  })

  it("detects string-based events via emit()", () => {
    const events = extractEvents(FIXTURE_PATH, [
      "src/events/notification.events.ts",
    ])

    const notificationSent = events.find(
      (e) => e.name === "notification.sent",
    )
    expect(notificationSent).toBeDefined()
    expect(notificationSent!.channel).toBe("notification.sent")
  })

  it("extracts events from multiple files", () => {
    const events = extractEvents(FIXTURE_PATH, [
      "src/events/loan.events.ts",
      "src/events/notification.events.ts",
    ])

    // Should have class-based and string-based events
    const classEvents = events.filter(
      (e) => !e.channel, // class-based events don't have a channel
    )
    const stringEvents = events.filter((e) => e.channel !== undefined)

    expect(classEvents.length).toBeGreaterThan(0)
    expect(stringEvents.length).toBeGreaterThan(0)
  })

  it("returns empty array for files with no events", () => {
    const events = extractEvents(FIXTURE_PATH, ["src/dto/loan.dto.ts"])
    expect(events).toHaveLength(0)
  })
})
