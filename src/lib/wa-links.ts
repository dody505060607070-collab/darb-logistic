/** Phone numbers that appear in a WhatsApp notice: "+" international numbers and Saudi mobiles written 05XXXXXXXX. */
const PHONE = /(?<![\d/=])(\+\d{9,15}|05\d{8})(?!\d)/g;

export function waDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return /^05\d{8}$/.test(d) ? `966${d.slice(1)}` : d;
}

/** Appends a tap-to-chat wa.me link for every phone number in the message (except the recipient's own). */
export function withWhatsAppLinks(text: string, recipient?: string | null): string {
  const own = recipient ? waDigits(recipient) : "";
  const seen = new Set<string>();
  for (const m of text.matchAll(PHONE)) {
    const d = waDigits(m[1]!);
    if (d !== own && d.length >= 9 && !text.includes(`wa.me/${d}`)) seen.add(d);
  }
  if (!seen.size) return text;
  const links = [...seen].slice(0, 3).map((d) => `💬 محادثة +${d}: https://wa.me/${d}`);
  return `${text}\n\n${links.join("\n")}`;
}
