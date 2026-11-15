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

describe("each job signs in straight to its own page", () => {
  it("driver → driver page", () => expect(roleHome(["driver"])).toBe("/driver"));
  it("representative → representative page", () => expect(roleHome(["representative"])).toBe("/representative"));
  it("workshop → repair center", () => expect(roleHome(["workshop"])).toBe("/repair-center"));
  it("owner keeps the main dashboard even with a driver job", () => expect(roleHome(["owner", "driver"])).toBe("/"));
});
