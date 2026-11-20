import { z } from "zod";

export const CONTACT_TOPICS = [
  { value: "general", label: "A general question" },
  { value: "provider", label: "Joining as a provider" },
  { value: "accessibility", label: "An accessibility problem" },
  { value: "privacy", label: "Privacy" },
] as const;

type TopicValue = (typeof CONTACT_TOPICS)[number]["value"];
const topicValues = CONTACT_TOPICS.map((t) => t.value) as [TopicValue, ...TopicValue[]];

export const MESSAGE_MAX = 1000;

// Indian mobile: optional +91 / 0 prefix, then 10 digits starting 6-9. Spaces and dashes are ignored.
const indianMobile = /^(?:\+91|91|0)?[6-9]\d{9}$/;

export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name, at least 2 characters.").max(80, "Keep your name under 80 characters."),
    email: z.union([z.literal(""), z.email("Enter an email address like name@example.com.")]),
    phone: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => v === "" || indianMobile.test(v), "Enter a 10-digit Indian mobile number."),
    topic: z.enum(topicValues, { error: "Choose what your message is about." }),
    message: z
      .string()
      .trim()
      .min(10, "Write at least 10 characters so we know what you need.")
      .max(MESSAGE_MAX, `Keep your message under ${MESSAGE_MAX} characters.`),
  })
  .refine((v) => v.email !== "" || v.phone !== "", {
    path: ["email"],
    message: "Give an email address or a mobile number so a reply is possible.",
    // Run even when other fields fail, so every problem is reported in one pass.
    when: (payload) => typeof payload.value === "object" && payload.value !== null,
  });

export type ContactInput = z.input<typeof contactSchema>;
