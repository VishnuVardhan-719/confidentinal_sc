import type { MetadataRoute } from "next";

/** Web app manifest: name, colours and the owner-supplied logo as the app icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SureCure Visit",
    short_name: "SureCure Visit",
    description: "Healthcare at your doorstep: verified doctors, lab sample collection, scheduled ambulance transport and caretakers.",
    start_url: "/en",
    display: "browser",
    background_color: "#faf8f2",
    theme_color: "#faf8f2",
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
