import { describe, expect, it } from 'vitest';
import { canNotifyTask } from '@/lib/task-notifications';
describe('task notification permissions', () => {
  it('assignees cannot emit assignment or approval notifications', () => {
    expect(canNotifyTask('assigned', 'assigned', false, true)).toBe(false);
    expect(canNotifyTask('approved', 'completed', false, true)).toBe(false);
  });
  it('only assignee can notify submission, after submitting', () => {
    expect(canNotifyTask('submitted', 'submitted', false, true)).toBe(true);
    expect(canNotifyTask('submitted', 'assigned', false, true)).toBe(false);
    expect(canNotifyTask('submitted', 'submitted', true, false)).toBe(false);
  });
  it('manager notification must match committed state', () => {
    expect(canNotifyTask('approved', 'completed', true, false)).toBe(true);
    expect(canNotifyTask('approved', 'assigned', true, false)).toBe(false);
    expect(canNotifyTask('returned', 'submitted', true, false)).toBe(false);
  });
});