import { z } from "zod";

export const channelSchema = z.enum(["sms", "email", "whatsapp"]);
export const topicSchema = z.enum(["booking", "payment", "verification"]);
const timestamp = z.iso.datetime({ offset: true });
const ids = z.array(z.uuid()).min(1).max(100);
const notice = z.string().trim().min(1).max(80);
export const readSchema = z.union([
  z.object({ ids }).strict(),
  z.object({ before: timestamp }).strict(),
]);
export const preferenceSchema = z.object({
  channel: channelSchema, topic: topicSchema, enabled: z.boolean(),
  noticeVersion: notice, expectedVersion: z.number().int().min(0).max(2147483646),
}).strict();
export const inboxPageSchema = z.object({ before: timestamp.optional(), beforeId: z.uuid().optional() }).strict()
  .refine(v => !!v.before === !!v.beforeId, "Use both cursor fields");
export const failurePageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), after: z.uuid().optional() }).strict();
export const rpcSchemas = {
  mark_notifications_read: z.object({ p_ids: ids }).strict(),
  mark_all_notifications_read: z.object({ p_before: timestamp }).strict(),
  set_notification_preference: z.object({ p_channel: channelSchema, p_topic: topicSchema, p_enabled: z.boolean(), p_notice_version: notice, p_expected_version: z.number().int().min(0).max(2147483646) }).strict(),
  list_notification_failures: z.object({ p_limit: z.number().int().min(1).max(100), p_after: z.uuid().nullable() }).strict(),
} as const;
export type NotificationCommand = keyof typeof rpcSchemas;
export type NotificationArgs<C extends NotificationCommand> = z.input<(typeof rpcSchemas)[C]>;

const priority = z.enum(["safety", "transactional", "routine"]);
export const notificationSchema = z.object({
  id: z.uuid(), template_key: z.string().regex(/^[a-z][a-z_]*\.[a-z][a-z0-9_]*$/), template_version: z.number().int().positive(),
  priority, booking_id: z.uuid().nullable(), created_at: timestamp, read_at: timestamp.nullable(),
  params: z.object({
    public_ref: z.string().regex(/^SCV-[0-9]{12}$/).optional(), category: z.enum(["doctor", "lab", "ambulance", "caretaker"]).optional(),
    state: z.enum(["draft", "requested", "accepted", "confirmed", "in_progress", "completed", "declined", "expired", "cancelled", "interrupted", "no_show"]).optional(),
    reason: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/).optional(), start_at: timestamp.optional(),
    amount_paise: z.string().regex(/^(0|[1-9][0-9]{0,14})$/).optional(), emergency_notice: z.boolean().optional(),
  }).strict(),
}).strict();
export const preferenceRowSchema = z.object({ channel: channelSchema, topic: topicSchema, enabled: z.boolean(), version: z.number().int().positive(), updated_at: timestamp }).strict();
export const failureSchema = z.object({
  delivery_id: z.uuid(), event_id: z.uuid(), rule_id: z.string(), channel: channelSchema, priority,
  status: z.enum(["dead", "expired", "suppressed"]), attempts: z.number().int().min(0).max(20),
  last_error_code: z.enum(["timeout", "network", "vendor_throttled", "vendor_5xx", "config_error", "invalid_destination", "template_rejected", "destination_opted_out", "content_rejected"]).nullable(),
  created_at: timestamp, updated_at: timestamp,
}).strict();
export const resultSchemas = {
  mark_notifications_read: z.number().int().min(0).max(100),
  mark_all_notifications_read: z.number().int().nonnegative(),
  set_notification_preference: z.number().int().positive(),
  list_notification_failures: z.array(failureSchema).max(100),
};
