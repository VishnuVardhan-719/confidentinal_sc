export type Channel = "sms" | "email" | "whatsapp";
export type OutboundMessage = {
  deliveryId: string; attemptNo: number; channel: Channel; to: string; locale: "en" | "te" | "hi";
  templateKey: "ext.booking_update" | "ext.action_needed" | "ext.not_going_ahead" | "ext.account_update";
  templateVersion: number; text: string; subject?: string;
};
export type SendResult =
  | { kind: "accepted"; vendorRef: string }
  | { kind: "retryable"; code: "timeout" | "network" | "vendor_throttled" | "vendor_5xx" | "config_error" }
  | { kind: "permanent"; code: "invalid_destination" | "template_rejected" | "destination_opted_out" | "content_rejected" };
export interface ChannelAdapter {
  readonly channel: Channel;
  readonly name: "log";
  send(message: OutboundMessage, signal: AbortSignal): Promise<SendResult>;
}
