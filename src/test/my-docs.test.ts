import { describe, expect, it } from "vitest";
import { docChecklist } from "@/lib/my-docs";

describe("docChecklist", () => {
  it("marks missing, pending, approved and rejected using the latest upload", () => {
    const r = docChecklist(["إقامة", "رخصة قيادة", "بطاقة سائق", "صورة شخصية"], [
      { doc_type: "رخصة قيادة", review_status: "pending" },
      { doc_type: "بطاقة سائق", review_status: "approved" },
      { doc_type: "صورة شخصية", review_status: "approved", created_at: "2026-01-01" },
      { doc_type: "صورة شخصية", review_status: "rejected", created_at: "2026-02-01" },
    ]);
    expect(r.map((x) => x.state)).toEqual(["missing", "pending", "approved", "rejected"]);
  });
});
