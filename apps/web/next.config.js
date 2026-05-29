/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@junglapp/types', '@junglapp/firebase'],
};

module.exports = nextConfig;
