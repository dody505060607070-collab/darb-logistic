import dictionary from './en.json';

const ARABIC = /[\u0600-\u06ff]/;
const normalize = (s: string) => s.replace(/[\u064b-\u065f\u0670]/g, '').replace(/\s+/g, ' ').trim();
const catalog = new Map(Object.entries(dictionary).map(([ar, en]) => [normalize(ar), en]));
const phrases = [...catalog.keys()].sort((a, b) => b.length - a.length);

/** Exact phrases first; never replace a fragment inside an Arabic word. */
export function translateUi(text: string): string {
  if (!ARABIC.test(text)) return text;
  const trimmed = normalize(text);
  const exact = catalog.get(trimmed);
  if (exact) return text.replace(text.trim(), exact);
  let output = trimmed;
  for (const phrase of phrases) {
    if (!output.includes(phrase)) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(`(?<![\\u0600-\\u06ff])${escaped}(?![\\u0600-\\u06ff])`, 'g');
    output = output.replace(boundary, catalog.get(phrase) ?? phrase);
    if (!ARABIC.test(output)) break;
  }
  return output;
}