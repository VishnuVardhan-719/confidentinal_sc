/** The planned request flow. Shared by the home page and How it works so the wording stays identical. */
export const requestSteps = [
  {
    title: "You choose a service",
    body: "Pick the kind of care you need: a doctor visit, a lab service, a scheduled ambulance or caretaker support.",
  },
  {
    title: "You choose a provider",
    body: "You select the provider you prefer. The provider sets their own price, and you see it before you send a request.",
  },
  {
    title: "The provider accepts",
    body: "A request is not a confirmed booking. The provider reviews it and accepts or declines.",
  },
] as const;
