/** Channels a visit reminder may use. In-app booking status is always shown and is not a preference. */
export const REMINDER_CHANNELS = ["sms", "whatsapp", "email"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export type QuietHours = {
  enabled: boolean;
  /** HH:MM in India time (IST). May span midnight (start later than end). */
  start: string;
  end: string;
};

export type ReminderPrefs = {
  channels: Record<ReminderChannel, boolean>;
  quietHours: QuietHours;
  version: number;
  updatedAt: string;
};

export type ReminderPrefsInput = Pick<ReminderPrefs, "channels" | "quietHours">;

export const REMINDER_ISSUES = ["quiet_start_invalid", "quiet_end_invalid", "quiet_same"] as const;
export type ReminderIssue = (typeof REMINDER_ISSUES)[number];
export type ReminderField = "quietStart" | "quietEnd";
