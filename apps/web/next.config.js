const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@junglapp/types', '@junglapp/firebase'],
  images: { dangerouslyAllowSVG: true, contentDispositionType: 'attachment', contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;" },
  webpack(config) {
    config.resolve.alias['react-native'] = path.resolve(__dirname, 'stubs/react-native.js');
    config.resolve.alias['@react-native-async-storage/async-storage'] = path.resolve(__dirname, 'stubs/react-native.js');
    return config;
  },
};

module.exports = nextConfig;
