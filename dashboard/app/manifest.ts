import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KryptonVision Security Operations",
    short_name: "KryptonVision",
    description: "Enterprise Video Surveillance, AI Detection & Operations Command Center",
    start_url: "/login?source=pwa",
    id: "/login",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#090d16",
    theme_color: "#0f172a",
    lang: "en",
    dir: "ltr",
    categories: ["security", "productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Live Operations",
        short_name: "Live View",
        url: "/operations",
        description: "Open Live Camera Surveillance Grid",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Admin Organization",
        short_name: "Admin",
        url: "/admin/organization",
        description: "Manage Organization Hierarchy and Personnel",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
