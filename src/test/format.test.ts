import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "@/lib/format";

describe("Riyadh time handling", () => {
  it("stores a Riyadh wall-clock time as UTC (UTC+3)", () => {
    expect(fromLocalInput("2026-01-16T08:00")).toBe("2026-01-16T05:00:00.000Z");
  });
  it("shows a UTC instant as Riyadh wall-clock time", () => {
    expect(toLocalInput("2026-01-16T05:00:00.000Z")).toBe("2026-01-16T08:00");
  });
});
