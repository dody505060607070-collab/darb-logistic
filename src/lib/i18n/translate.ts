import dictionary from './en.json';

export type TargetLang = 'en' | 'ur';
const ARABIC = /[\u0600-\u06ff]/;
const normalize = (s: string) => s.replace(/[\u064b-\u065f\u0670]/g, '').replace(/\s+/g, ' ').trim();
type Catalog = { map: Map<string, string>; pattern: RegExp | null };

function build(dict: Record<string, string>): Catalog {
  const map = new Map(Object.entries(dict).map(([ar, out]) => [normalize(ar), out]));
  const phrases = [...map.keys()].filter(Boolean).sort((a, b) => b.length - a.length)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // one pass, longest phrase first, never inside an Arabic-script word, never re-translating output
  const pattern = phrases.length ? new RegExp(`(?<![\\u0600-\\u06ff])(?:${phrases.join('|')})(?![\\u0600-\\u06ff])`, 'g') : null;
  return { map, pattern };
}

const catalogs: Partial<Record<TargetLang, Catalog>> = {};
const getCatalog = (lang: TargetLang) => (catalogs[lang] ??= lang === 'en' ? build(dictionary) : build({}));

/** Loads a language dictionary on demand so Arabic and English pages never download Urdu text. */
export async function loadCatalog(lang: TargetLang) {
  if (lang === 'ur' && !catalogs.ur?.pattern) catalogs.ur = build((await import('./ur.json')).default as Record<string, string>);
  return getCatalog(lang);
}
export function registerCatalog(lang: TargetLang, dict: Record<string, string>) { catalogs[lang] = build(dict); }

/** Exact phrases first; never replace a fragment inside an Arabic word. */
export function translateUi(text: string, lang: TargetLang = 'en'): string {
  if (!ARABIC.test(text)) return text;
  const { map, pattern } = getCatalog(lang);
  const trimmed = normalize(text);
  const exact = map.get(trimmed);
  if (exact) return text.replace(text.trim(), exact);
  if (!pattern) return text;
  const output = trimmed.replace(pattern, m => map.get(m) ?? m);
  return output === trimmed ? text : output;
}
