import { describe, expect, it } from "vitest";
import { optionsAreText, resolveChoice } from "./choice";

const branches: [string, string][] = [["b1", "فرع الرياض"], ["b2", "فرع جدة"]];

describe("choice fields accept typed text", () => {
  it("typing «لا يوجد فرع» saves no branch", () => {
    expect(resolveChoice("لا يوجد فرع", branches)).toEqual({ kind: "empty" });
    expect(resolveChoice("بدون فرع", branches)).toEqual({ kind: "empty" });
  });
  it("typing an existing name picks that option", () => {
    expect(resolveChoice("  فرع  جده ", branches)).toEqual({ kind: "match", value: "b2" });
  });
  it("typing a new name is kept as custom text", () => {
    expect(resolveChoice("فرع الدمام", branches)).toEqual({ kind: "custom", text: "فرع الدمام" });
  });
  it("a text-valued list allows free text but a coded list does not", () => {
    expect(optionsAreText([["تأمين", "تأمين"], ["أخرى", "أخرى"]])).toBe(true);
    expect(optionsAreText([["available", "متاح"]])).toBe(false);
  });
});
