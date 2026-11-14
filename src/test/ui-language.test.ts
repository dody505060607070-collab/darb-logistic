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
import { loadCatalog } from '@/lib/i18n/translate';
import { localeFor, parseLang } from '@/lib/i18n/lang';
describe('Urdu language', () => {
  it('translates interface phrases into Urdu', async () => {
    await loadCatalog('ur');
    expect(translateUi('رقم الجوال', 'ur')).toBe('موبائل نمبر');
    expect(translateUi('رحلة الرجوع — TRP-2026-00126', 'ur')).toContain('TRP-2026-00126');
  });
  it('leaves already-translated Urdu text unchanged', async () => {
    await loadCatalog('ur');
    expect(translateUi('موبائل نمبر', 'ur')).toBe('موبائل نمبر');
  });
  it('accepts only the three supported languages and keeps Latin digits', () => {
    expect(parseLang('ur')).toBe('ur');
    expect(parseLang('fr')).toBe('ar');
    expect(localeFor('ur', 'gregory')).toBe('ur-PK-u-ca-gregory-nu-latn');
  });
});
