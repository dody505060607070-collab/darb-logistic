import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('workshop pending intake no longer writes asset availability', () => {
  const sql = readFileSync('drizzle/migrations/0037_workshop_intake_pending_no_asset_mutation.sql', 'utf8');
  expect(sql).not.toMatch(/UPDATE\s+(public\.)?assets\s+SET/i);
});
it('both role helpers scope identity and deny anonymous execution', () => {
  const sql = readFileSync('drizzle/migrations/0038_role_helpers_scoped_identity_checks.sql', 'utf8');
  expect(sql.match(/_user_id=auth\.uid\(\)/g)).toHaveLength(2);
  expect(sql).toContain('FROM PUBLIC,anon');
});