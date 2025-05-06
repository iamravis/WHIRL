/** @type {import('next').NextConfig} */
const webpack = require('webpack'); // Import webpack

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    unoptimized: true,
  },
  transpilePackages: ['react-syntax-highlighter', 'rehype-katex', 'remark-math', 'katex'],
  webpack: (config, { isServer }) => {
    // Option 1: Keep external for server
    if (isServer) {
      config.externals = [...config.externals, 'onnxruntime-node'];
    }

    // Option 2: Ignore requests for the specific binding file name
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /onnxruntime_binding\.node$/,
        // contextRegExp: /onnxruntime-node/, // Removed context constraint
      })
    );

    // Return the modified config
    return config;
  },
}

module.exports = nextConfig 