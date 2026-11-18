/** Pure support-ticket helpers shared by SupportTicketForm and tests. Mirrors the support module's createTicketSchema bounds. */
export const TICKET_CATEGORIES = ["service", "payment", "account", "access"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_DESCRIPTION_MAX = 1000;

export type TicketDraft = { category: TicketCategory | ""; bookingId: string; description: string };
export type TicketInput = { category: TicketCategory; bookingId?: string; description: string };
export type TicketErrors = Partial<Record<"category" | "bookingId" | "description", "required" | "tooLong" | "invalid">>;

export function validateTicket(
  draft: TicketDraft,
  allowedBookingIds: readonly string[] = [],
): { ok: true; input: TicketInput } | { ok: false; errors: TicketErrors } {
  const errors: TicketErrors = {};
  const description = draft.description.trim();
  if (!(TICKET_CATEGORIES as readonly string[]).includes(draft.category)) errors.category = "required";
  if (!description) errors.description = "required";
  else if (description.length > TICKET_DESCRIPTION_MAX) errors.description = "tooLong";
  if (draft.bookingId && !allowedBookingIds.includes(draft.bookingId)) errors.bookingId = "invalid";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: { category: draft.category as TicketCategory, description, ...(draft.bookingId ? { bookingId: draft.bookingId } : {}) },
  };
}

/**
 * Heuristic warning (never blocking) for text that looks like an OTP, card, Aadhaar or other long
 * number. Support messages must not carry codes or identifiers; health details are warned about in copy.
 */
export function looksSensitive(text: string): boolean {
  const compact = text.replace(/[\s-]/g, "");
  if (/\d{12,}/.test(compact)) return true; // Aadhaar (12), card (13-19)
  return /(^|\D)\d{6}(\D|$)/.test(text); // standalone 6-digit code (OTP length)
}
