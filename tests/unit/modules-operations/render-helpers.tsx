import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import accessibility from "@/messages/en/accessibility.json";
import admin from "@/messages/en/admin.json";
import ambulance from "@/messages/en/ambulance.json";
import caretaker from "@/messages/en/caretaker.json";
import common from "@/messages/en/common.json";
import errors from "@/messages/en/errors.json";
import lab from "@/messages/en/lab.json";

/** English messages for every namespace the operations views use. */
export const EN_MESSAGES = { accessibility, admin, ambulance, caretaker, common, errors, lab };

export function withIntl(ui: ReactNode, messages: Record<string, unknown> = EN_MESSAGES) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Kolkata">
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>
  );
}