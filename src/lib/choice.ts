/**
 * Choice fields accept either a picked option or typed text.
 * Typed text that matches an option (by label or value) becomes that option;
 * "لا يوجد …" / "بدون …" means no value; anything else is custom text.
 */
export type ChoiceOption = [value: string, label: string];

export type ChoiceResult =
  | { kind: "empty" }
  | { kind: "match"; value: string }
  | { kind: "custom"; text: string };

const NONE_PREFIXES = ["لا يوجد", "لايوجد", "بدون", "لا شيء", "لا شي", "none", "no ", "n/a"];
const NONE_EXACT = ["-", "—", "لا", "no", "none", "n/a"];

/** Loose Arabic/English comparison: trims, collapses spaces, unifies alef/ya/ta-marbuta forms. */
export function normalizeChoice(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .toLowerCase();
}

export function isNoneText(text: string): boolean {
  const n = normalizeChoice(text);
  if (!n) return true;
  if (NONE_EXACT.includes(n)) return true;
  return NONE_PREFIXES.some((p) => n === normalizeChoice(p) || n.startsWith(`${normalizeChoice(p)} `) || (p.endsWith(" ") && n.startsWith(p)));
}

export function resolveChoice(text: string, options: ChoiceOption[]): ChoiceResult {
  if (isNoneText(text)) return { kind: "empty" };
  const n = normalizeChoice(text);
  const hit = options.find(([v, l]) => normalizeChoice(l) === n || normalizeChoice(v) === n);
  if (hit) return { kind: "match", value: hit[0] };
  return { kind: "custom", text: text.trim().replace(/\s+/g, " ") };
}

/** Options filtered by typed text; shows everything while the text is empty or equals the chosen label. */
export function filterChoices(text: string, options: ChoiceOption[], chosenLabel?: string): ChoiceOption[] {
  const n = normalizeChoice(text);
  if (!n || (chosenLabel !== undefined && normalizeChoice(chosenLabel) === n)) return options;
  return options.filter(([, l]) => normalizeChoice(l).includes(n));
}

/** A fixed list whose stored value equals its label is plain text, so any typed text can be saved. */
export function optionsAreText(options: ChoiceOption[]): boolean {
  return options.length > 0 && options.every(([v, l]) => v === l);
}
