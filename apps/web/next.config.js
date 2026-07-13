const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['@junglapp/types', '@junglapp/firebase'],
  images: { unoptimized: true, dangerouslyAllowSVG: true, contentDispositionType: 'attachment', contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;" },
  webpack(config) {
    config.resolve.alias['react-native'] = path.resolve(__dirname, 'stubs/react-native.js');
    config.resolve.alias['@react-native-async-storage/async-storage'] = path.resolve(__dirname, 'stubs/react-native.js');
    config.resolve.alias['expo-file-system'] = path.resolve(__dirname, 'stubs/expo-file-system.js');
    return config;
  },
};

module.exports = nextConfig;
