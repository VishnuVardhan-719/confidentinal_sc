import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAdapter } from "./adapters/log";
import type { Channel, ChannelAdapter, SendResult } from "./adapters/types";
import { channelSchema } from "./schemas";
import { externalKeys, renderExternal } from "./render";

const claimSchema = z.object({
  delivery_id: z.uuid(), attempt_no: z.number().int().min(1).max(20), channel: channelSchema,
  locale: z.enum(["en", "te", "hi"]), template_key: z.enum(externalKeys), template_version: z.literal(1),
  params: z.object({ public_ref: z.string().regex(/^SCV-[0-9]{12}$/).optional(), locale: z.enum(["en", "te", "hi"]) }).strict(),
  destination: z.string().min(1).max(320),
}).strict();
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(secret));
}
export async function dispatchNotifications(
  db: Pick<SupabaseClient, "rpc">, channels: readonly Channel[], appOrigin: string,
  options: { adapter?: (channel: Channel) => ChannelAdapter; timeoutMs?: number } = {},
) {
  const counts = { claimed: 0, accepted: 0, failed: 0 };
  for (const channel of channels) {
    const { data, error } = await db.rpc("claim", { p_channel: channel, p_limit: 50 });
    if (error) throw new Error("notifications_unavailable");
    const claimed = z.array(claimSchema).max(50).parse(data);
    // All leases share the claim time. Start the bounded batch together so one
    // slow send cannot consume another delivery's lease before it starts.
    const completedBatch = await Promise.allSettled(claimed.map(async claim => {
      if (claim.channel !== channel || claim.params.locale !== claim.locale) throw new Error("invalid_claim");
      counts.claimed++;
      let result: SendResult;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const link = `${new URL(appOrigin).origin}/${claim.locale}/${claim.template_key === "ext.account_update" ? "provider" : "patient"}`;
        const text = renderExternal(claim.template_key, claim.locale, { ref: claim.params.public_ref, link }, appOrigin);
        const adapter = (options.adapter ?? logAdapter)(channel);
        const timeout = new Promise<SendResult>(resolve => {
          timer = setTimeout(() => { controller.abort(); resolve({ kind: "retryable", code: "timeout" }); }, options.timeoutMs ?? 10_000);
        });
        result = await Promise.race([adapter.send({
          deliveryId: claim.delivery_id, attemptNo: claim.attempt_no, channel, to: claim.destination,
          locale: claim.locale, templateKey: claim.template_key, templateVersion: claim.template_version, text,
          ...(channel === "email" ? { subject: claim.template_key === "ext.account_update" ? "SureCure Visit: account update" : `SureCure Visit: update for ${claim.params.public_ref}` } : {}),
        }, controller.signal), timeout]);
      } catch {
        result = { kind: "retryable", code: controller.signal.aborted ? "timeout" : "network" };
      } finally { if (timer) clearTimeout(timer); }
      const completed = await db.rpc("complete", {
        p_delivery_id: claim.delivery_id, p_attempt_no: claim.attempt_no, p_outcome: result.kind,
        p_error_code: result.kind === "accepted" ? null : result.code, p_vendor_ref: result.kind === "accepted" ? result.vendorRef : null,
      });
      // Never retry a stale lease or claim that failed to complete; sweep owns it.
      if (completed.error) throw new Error("notifications_unavailable");
      if (result.kind === "accepted") counts.accepted++; else counts.failed++;
    }));
    // Await every completion even if one lease became stale; no background work
    // survives the request and no raw adapter/database details leave this layer.
    if (completedBatch.some(result => result.status === "rejected")) throw new Error("notifications_unavailable");
  }
  return counts;
}
