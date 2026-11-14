export function retryRead(failureCount: number, error: unknown) {
  const value = error as { status?: number; code?: string; message?: string } | null;
  if (value?.status && value.status >= 400 && value.status < 500 && value.status !== 429) return false;
  if (['42501', '23503', '23505', 'PGRST301', 'PGRST302'].includes(value?.code ?? '') || /permission|Unauthorized|Forbidden|صلاحية/i.test(value?.message ?? '')) return false;
  return failureCount < 1;
}