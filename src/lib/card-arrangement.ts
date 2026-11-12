export function reconcileCardOrder(saved: string[], current: string[]): string[] {
  return [...new Set([...saved.filter(id => current.includes(id)), ...current])];
}

export function moveCard(order: string[], active: string, over: string): string[] {
  const from = order.indexOf(active);
  const to = order.indexOf(over);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, active);
  return next;
}

export function arrangementKey(account: string, path: string) {
  return `shitaa-card-arrangement:v1:${account}:${path}`;
}