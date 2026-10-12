import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = "https://www.thefount.co.kr";
  const base = `${origin}/location`;
  return {
    rules: [
      { userAgent: "*", allow: "/location", disallow: ["/location/api/", "/location/auth/", "/location/preview/"] }
    ],
    sitemap: `${base}/sitemap.xml`,
    host: origin
  };
}
