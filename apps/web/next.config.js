/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@med/ui', '@med/icons', '@med/utils', '@med/types', '@med/config'],
  typedRoutes: false,
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
