import { describe, expect, it } from 'vitest';
import { translateUi } from '@/lib/i18n/translate';
describe('phrase translation', () => {
  it('never substitutes fragments inside unknown Arabic words', () => {
    expect(translateUi('بالزبون')).toBe('بالزبون');
  });
  it('preserves record identifiers while translating full phrases', () => {
    expect(translateUi('رحلة الرجوع — TRP-2026-00126')).toBe('Return trip — TRP-2026-00126');
  });
});
