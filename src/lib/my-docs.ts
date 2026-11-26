export type DocState = "missing" | "pending" | "approved" | "rejected";
export const DEFAULT_REQUIRED_EMPLOYEE = ["إقامة", "صورة شخصية"];

/** Required-document checklist for one person: latest upload per type decides the state. */
export function docChecklist(required: string[], docs: { doc_type: string; review_status?: string | null; created_at?: string | null }[]) {
  return required.map((type) => {
    const mine = docs.filter((d) => d.doc_type === type).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    const s = mine[0]?.review_status;
    const state: DocState = !mine.length ? "missing" : s === "approved" ? "approved" : s === "rejected" ? "rejected" : "pending";
    return { type, state };
  });
}
