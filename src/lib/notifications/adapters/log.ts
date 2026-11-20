import type { Channel, ChannelAdapter } from "./types";
export function logAdapter(channel: Channel): ChannelAdapter {
  return {
    channel, name: "log",
    async send(message, signal) {
      signal.throwIfAborted();
      // Log metadata only. This adapter sends nothing to a real destination.
      console.info({ deliveryId: message.deliveryId, channel, templateKey: message.templateKey, locale: message.locale });
      return { kind: "accepted", vendorRef: `log:${message.deliveryId}` };
    },
  };
}
