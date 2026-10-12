import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: "https://www.thefount.co.kr/location",
    lastModified: new Date("2026-10-07"),
    changeFrequency: "weekly",
    priority: 1
  }];
}
