import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryNotice } from '@/components/darb/QueryNotice';

afterEach(cleanup);
describe('query retry behavior', () => {
  it('retries the failing query only', () => {
    const refetch = vi.fn(); const other = vi.fn();
    render(<><QueryNotice label="العهد" query={{ error: new Error('offline'), isFetching: false, refetch }} /><QueryNotice label="الفحوصات" query={{ data: [], isFetching: false, refetch: other }} /></>);
    fireEvent.click(screen.getByRole('button'));
    expect(refetch).toHaveBeenCalledTimes(1); expect(other).not.toHaveBeenCalled();
  });
  it('blocks repeated retries while the query is fetching', () => {
    const refetch = vi.fn();
    render(<QueryNotice label="العهد" query={{ error: new Error('offline'), isFetching: true, refetch }} />);
    fireEvent.click(screen.getByRole('button')); expect(refetch).not.toHaveBeenCalled();
  });
});