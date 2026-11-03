import { db } from "./db";
import { errMsg } from "./format";

/** Minimal offline outbox for the driver app. Each op carries a client_event_id so retries are idempotent server-side. */
export type OutboxOp =
  | { id: string; kind: "event"; payload: Record<string, unknown>; createdAt: string; status: "pending" | "rejected"; error?: string }
  | { id: string; kind: "expense" | "fuel"; payload: Record<string, unknown>; createdAt: string; status: "pending" | "rejected"; error?: string };

const KEY = "darb-driver-outbox";

export function readOutbox(): OutboxOp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxOp[];
  } catch {
    return [];
  }
}
function write(ops: OutboxOp[]) {
  localStorage.setItem(KEY, JSON.stringify(ops));
  window.dispatchEvent(new Event("darb-outbox"));
}
export function enqueue(op: Omit<OutboxOp, "createdAt" | "status">) {
  write([...readOutbox(), { ...op, createdAt: new Date().toISOString(), status: "pending" } as OutboxOp]);
}
export function removeOp(id: string) {
  write(readOutbox().filter((o) => o.id !== id));
}

async function send(op: OutboxOp) {
  if (op.kind === "event") return db.rpc("record_trip_event", op.payload);
  if (op.kind === "expense") return db.from("expenses").insert(op.payload);
  return db.from("fuel_entries").insert(op.payload);
}

/** Try to send pending ops; returns how many were accepted. Duplicate-key responses count as already accepted. */
export async function flushOutbox(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  let ok = 0;
  const ops = readOutbox();
  const next: OutboxOp[] = [];
  for (const op of ops) {
    if (op.status === "rejected") {
      next.push(op);
      continue;
    }
    const { error } = (await send(op)) as { error: unknown };
    if (!error || errMsg(error).includes("مكرر")) ok++;
    else if ((error as { message?: string }).message?.includes("Failed to fetch")) next.push(op);
    else next.push({ ...op, status: "rejected", error: errMsg(error) });
  }
  write(next);
  return ok;
}
