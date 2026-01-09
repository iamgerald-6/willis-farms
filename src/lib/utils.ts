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
