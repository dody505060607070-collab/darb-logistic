import { describe, it, expect } from "vitest";
import { roleHome } from "@/components/darb/AppShell";
import { dashboardFor } from "@/components/darb/RoleDashboards";
describe("role home", () => {
  it("owner gets full dashboard", () => expect(dashboardFor(["owner"])).toBe(null));
  it("ops manager gets full dashboard", () => expect(dashboardFor(["ops_manager"])).toBe(null));
  it("dispatcher gets dispatcher board", () => expect(dashboardFor(["dispatcher"])).toBe("dispatcher"));
  it("accountant gets accountant board", () => expect(dashboardFor(["accountant"])).toBe("accountant"));
  it("maintenance gets maintenance board", () => expect(dashboardFor(["maintenance"])).toBe("maintenance"));
  it("fleet supervisor gets fleet board", () => expect(dashboardFor(["fleet_supervisor"])).toBe("fleet_supervisor"));
  it("everyone lands on home", () => expect(roleHome(["accountant"])).toBe("/"));
});
