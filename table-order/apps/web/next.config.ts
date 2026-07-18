import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@menubook/shared", "@menubook/ui", "@menubook/db"],
};

export default nextConfig;
