export type Lang = "ar" | "en" | "ur";
export const LANGS: { id: Lang; label: string; short: string; dir: "rtl" | "ltr" }[] = [
  { id: "ar", label: "العربية", short: "ع", dir: "rtl" },
  { id: "en", label: "English", short: "EN", dir: "ltr" },
  { id: "ur", label: "اردو", short: "اُ", dir: "rtl" },
];
const KEY = "shata-lang";
export function parseLang(v: string | null | undefined): Lang {
  return v === "en" || v === "ur" ? v : "ar";
}
export function getLang(): Lang {
  try { return parseLang(localStorage.getItem(KEY)); } catch { return "ar"; }
}
/** Intl locale for dates and numbers; digits stay Latin in every language. */
export function localeFor(l: Lang, cal = ""): string {
  const base = l === "en" ? "en-GB" : l === "ur" ? "ur-PK" : "ar-SA";
  return `${base}-u${cal ? `-ca-${cal}` : ""}-nu-latn`;
}
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("shata-lang", { detail: l }));
  // dates and numbers are formatted at render time; reload so every value follows the new language
  setTimeout(() => window.location.reload(), 50);
}
