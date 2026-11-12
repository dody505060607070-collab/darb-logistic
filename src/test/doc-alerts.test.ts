import { describe, expect, it } from "vitest";
import { docStage, missingDocs, parseAlertDays } from "@/lib/doc-alerts";

describe("document alerts", () => {
  it("uses 30/15/7 windows: 20 days left is in the 30-day window", () => {
    expect(docStage(20, [30, 15, 7])).toEqual({ kind: "alert", days: 20, threshold: 30 });
  });
  it("10 days left is in the 15-day window, 5 in the 7-day window", () => {
    expect(docStage(10, [30, 15, 7])).toMatchObject({ threshold: 15 });
    expect(docStage(5, [30, 15, 7])).toMatchObject({ threshold: 7 });
  });
  it("31 days left is valid, -1 is expired, no date is undated", () => {
    expect(docStage(31, [30, 15, 7]).kind).toBe("valid");
    expect(docStage(-1, [30, 15, 7]).kind).toBe("expired");
    expect(docStage(null).kind).toBe("undated");
  });
  it("parses Arabic digits and separators, rejects out-of-range", () => {
    expect(parseAlertDays("٧، 30 ,15")).toEqual([30, 15, 7]);
    expect(parseAlertDays("0, 15")).toBeNull();
    expect(parseAlertDays("400")).toBeNull();
  });
  it("a driver without إقامة is listed missing; a rejected record does not count", () => {
    const res = missingDocs([{ type: "driver", id: "d1" }], [
      { entity_type: "driver", entity_id: "d1", doc_type: "رخصة قيادة", review_status: "approved" },
      { entity_type: "driver", entity_id: "d1", doc_type: "إقامة", review_status: "rejected" },
    ], { driver: ["إقامة", "رخصة قيادة"], asset: [] });
    expect(res).toEqual([{ entity_type: "driver", entity_id: "d1", doc_type: "إقامة" }]);
  });
});

import { driverProfileDocs } from "@/lib/doc-alerts";
describe("driver profile licence", () => {
  it("a licence number on the driver profile satisfies رخصة قيادة", () => {
    const docs = driverProfileDocs([{ id: "d1", license_no: "123" }, { id: "d2" }]);
    const res = missingDocs([{ type: "driver", id: "d1" }, { type: "driver", id: "d2" }], docs, { driver: ["رخصة قيادة"], asset: [] });
    expect(res.map((r) => r.entity_id)).toEqual(["d2"]);
  });
});
