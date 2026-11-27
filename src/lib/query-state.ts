/** Undefined is unknown, not a successfully loaded empty list; cached results survive refetch errors. */
export function queryState(query: { data?: unknown; error?: unknown; isFetching: boolean }) {
  const loaded = query.data !== undefined;
  return { loaded, pending: !loaded && !query.error, failed: !!query.error, refreshing: loaded && query.isFetching };
}