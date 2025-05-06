/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'bufferutil': false,
      'utf-8-validate': false,
    };
    return config;
  },
};

module.exports = nextConfig;
