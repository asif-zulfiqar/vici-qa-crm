// Phone numbers and lead ids are personal data. Without `calls.view_pii` a user sees only the
// last 4 digits of a phone and no lead id. Every service that returns calls uses these
// functions, so the rule lives in one place. The database keeps the full values.

/** "5550102100" -> "•••-•••-2100". Fewer than 4 digits -> "•••". */
export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `•••-•••-${digits.slice(-4)}` : "•••";
}

export type Contact = { phone: string | null; leadId: string | null; leadMasked: boolean };

/** The phone and lead id as this user may see them. */
export function presentContact(values: { phone: string | null; leadId: string | null }, canSeePii: boolean): Contact {
  if (canSeePii) return { phone: values.phone, leadId: values.leadId, leadMasked: false };
  return { phone: maskPhone(values.phone), leadId: null, leadMasked: true };
}
