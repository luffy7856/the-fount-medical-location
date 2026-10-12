/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/location",
  distDir: process.env.LOCATION_BUILD_DIR || ".next",
  reactStrictMode: true,
};

export default nextConfig;
