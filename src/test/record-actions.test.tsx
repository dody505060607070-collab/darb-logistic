import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordActions } from '@/components/darb/RecordActions';

const mocks = vi.hoisted(() => ({ owner: true, remove: vi.fn(), invalidate: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: () => mocks.owner }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('@/lib/db', () => ({ db: { from: () => ({ delete: mocks.remove }) } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); mocks.owner = true;
  mocks.remove.mockReturnValue({ eq: () => ({ select: async () => ({ data: [{ id: 'record' }], error: null }) }) });
});
describe('confirmed record deletion', () => {
  it('requires confirmation and cancel never deletes a record', () => {
    render(<RecordActions table="customers" id="record" />);
    fireEvent.click(screen.getByLabelText('حذف السجل'));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('deletes and refreshes the readback only after confirmation', async () => {
    render(<RecordActions table="customers" id="record" />);
    fireEvent.click(screen.getByLabelText('حذف السجل'));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الحذف' }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it('never reports success when no row was deleted', async () => {
    mocks.remove.mockReturnValue({ eq: () => ({ select: async () => ({ data: [], error: null }) }) });
    render(<RecordActions table="customers" id="record" />);
    fireEvent.click(screen.getByLabelText('حذف السجل'));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الحذف' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('does not offer deletion to non-owners or for invoices', () => {
    mocks.owner = false;
    const { rerender } = render(<RecordActions table="customers" id="record" />);
    expect(screen.queryByLabelText('حذف السجل')).toBeNull();
    mocks.owner = true;
    rerender(<RecordActions table="invoices" id="record" />);
    expect(screen.queryByLabelText('حذف السجل')).toBeNull();
  });
});