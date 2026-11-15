import { describe, expect, it } from "vitest";
import { assignmentProblem } from "@/lib/trip-assignment";

const driver = { full_name: "khaled", status: "available", license_expiry: "2030-01-01" };
const tractor = { code: "T1", kind: "tractor", status: "available" };
const trailer = { code: "TR1", kind: "trailer", status: "available", capacity_tons: 30 };
const endIso = "2026-11-30T07:00:00.000Z";

describe("trip assignment preflight", () => {
  it("no driver chosen means nothing to check", () => expect(assignmentProblem({ driver: null, tractor: null, trailer: null, endIso })).toBeNull());
  it("refuses a driver without a recorded licence", () => expect(assignmentProblem({ driver: { ...driver, license_expiry: null }, tractor, trailer, endIso })).toContain("غير مسجلة"));
  it("refuses a licence ending before the trip ends", () => expect(assignmentProblem({ driver: { ...driver, license_expiry: "2026-11-20" }, tractor, trailer, endIso })).toContain("تنتهي"));
  it("refuses a driver without a truck", () => expect(assignmentProblem({ driver, tractor: null, trailer: null, endIso })).toContain("رأس القاطرة"));
  it("a loaded trip with a tractor needs a trailer", () => expect(assignmentProblem({ driver, tractor, trailer: null, endIso })).toContain("مقطورة"));
  it("refuses cargo heavier than the trailer", () => expect(assignmentProblem({ driver, tractor, trailer, endIso, weightTons: 342 })).toContain("سعة"));
  it("accepts a complete valid assignment", () => expect(assignmentProblem({ driver, tractor, trailer, endIso, weightTons: 10 })).toBeNull());
});
