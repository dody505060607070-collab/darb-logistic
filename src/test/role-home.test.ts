import { describe, it, expect } from "vitest";
import { roleHome } from "@/components/darb/AppShell";
describe("roleHome", () => {
  it("owner gets full dashboard", () => expect(roleHome(["owner"])).toBe("/"));
  it("dispatcher lands on operations", () => expect(roleHome(["dispatcher"])).toBe("/operations"));
  it("accountant lands on finance", () => expect(roleHome(["accountant"])).toBe("/finance"));
  it("maintenance lands on maintenance", () => expect(roleHome(["maintenance"])).toBe("/maintenance"));
});
