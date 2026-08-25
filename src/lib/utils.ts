export function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function toTelHref(phone: string) {
  return `tel:${phone.replace(/\s+/g, "")}`;
}

export function toWhatsAppHref(numberE164NoSpaces: string, message: string) {
  const base = "https://wa.me/";
  const encoded = encodeURIComponent(message);
  return `${base}${numberE164NoSpaces.replace(/\+/g, "")}?text=${encoded}`;
}

/** e.g. geraldsix89@gmail.com → g***@gmail.com */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.charAt(0)}***@${domain}`;
}
