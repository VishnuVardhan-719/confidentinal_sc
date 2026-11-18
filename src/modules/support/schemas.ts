import { z } from "zod";
import { utcSchema, versionSchema } from "@/modules/catalog/schemas";
export const ticketCategorySchema = z.enum(["service", "payment", "account", "access"]);
export const ticketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"]);
/** Minimal nonclinical description. Never prefill health records, OTPs or private attachments. */
export const createTicketSchema = z.strictObject({ category: ticketCategorySchema, bookingId: z.uuid().optional(), description: z.string().trim().min(1).max(1000) });
export const ticketSchema = z.object({ id: z.uuid(), reference: z.string().nullable(), category: ticketCategorySchema, bookingId: z.uuid().nullable(),
  status: ticketStatusSchema, owner: z.enum(["provider", "platform"]).nullable(), createdAt: utcSchema, updatedAt: utcSchema, version: versionSchema, synthetic: z.boolean() });
export type CreateTicket = z.infer<typeof createTicketSchema>;
export type SupportTicket = z.infer<typeof ticketSchema>;
