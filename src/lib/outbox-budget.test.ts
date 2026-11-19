import { describe, expect, it } from "vitest";
import { canStartSend, SCHEDULED_RUN_BUDGET_MS } from "./outbox-budget";

describe("WhatsApp sends fit inside the scheduled run", () => {
  it("starts a send at the beginning of a run", () => {
    expect(canStartSend(0, SCHEDULED_RUN_BUDGET_MS)).toBe(true);
  });
  it("does not start a send that could be cut off by the 5-second limit", () => {
    expect(canStartSend(1000, SCHEDULED_RUN_BUDGET_MS)).toBe(false);
  });
});
