import { describe, expect, it } from "vitest";
import { pairFromCustody } from "@/lib/trip-assignment";

const custody = [{ asset_id: "T1885", driver_id: "amjad" }, { asset_id: "T1071", driver_id: "zain" }];

describe("pairFromCustody", () => {
  it("picking a truck fills the driver holding its custody", () => {
    expect(pairFromCustody(custody, {}, "tractor_id", "T1885")).toEqual({ driver_id: "amjad" });
  });
  it("picking a driver fills the truck in their custody", () => {
    expect(pairFromCustody(custody, {}, "driver_id", "zain")).toEqual({ tractor_id: "T1071" });
  });
  it("never overrides a choice the user already made", () => {
    expect(pairFromCustody(custody, { driver_id: "zain" }, "tractor_id", "T1885")).toEqual({});
    expect(pairFromCustody(custody, { tractor_id: "T1885" }, "driver_id", "zain")).toEqual({});
  });
  it("a driver holding two trucks is not guessed", () => {
    expect(pairFromCustody([...custody, { asset_id: "T4206", driver_id: "zain" }], {}, "driver_id", "zain")).toEqual({});
  });
});
