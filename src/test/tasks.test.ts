import { describe, it, expect } from "vitest";
import { nextReminderAt } from "@/lib/tasks";
const c = "2026-11-04T00:00:00.000Z";
describe("task reminders", () => {
  it("urgent repeats every 12 hours", () =>
    expect(nextReminderAt("urgent", c, new Date("2026-11-04T13:00:00Z")).toISOString()).toBe("2026-11-05T00:00:00.000Z"));
  it("normal repeats every 24 hours", () =>
    expect(nextReminderAt("normal", c, new Date("2026-11-04T13:00:00Z")).toISOString()).toBe("2026-11-05T00:00:00.000Z"));
  it("urgent first reminder is 12h after creation", () =>
    expect(nextReminderAt("urgent", c, new Date("2026-11-04T01:00:00Z")).toISOString()).toBe("2026-11-04T12:00:00.000Z"));
});
