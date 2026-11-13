export type Lang = "ar" | "en";
const KEY = "shata-lang";
export function getLang(): Lang {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "ar"; } catch { return "ar"; }
}
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("shata-lang", { detail: l }));
}
