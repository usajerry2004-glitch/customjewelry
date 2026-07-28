const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  // Restores the browser's native scroll position on back/forward
  // navigation instead of Next.js resetting scroll to the top of the page.
  experimental: { scrollRestoration: true },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      // CAD files, reference images, and thumbnails uploaded to DO Spaces —
      // matches both the direct origin and a CDN endpoint if one is enabled.
      { protocol: 'https', hostname: '**.digitaloceanspaces.com' },
      { protocol: 'https', hostname: '**.cdn.digitaloceanspaces.com' },
    ],
  },
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:4000';
    return [
      // /api/proxy/:path* is NOT listed here — it's handled entirely by the
      // custom pages/api/proxy/[...path].ts route, which forwards headers,
      // streams the body, and returns readable errors. A framework rewrite
      // to the same path previously raced with that route and produced an
      // opaque 500 with no way to catch it from application code.
      {
        source: '/uploads/:path*',
        destination: `${backend}/uploads/:path*`,
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Suppress Sentry CLI output during builds
  silent: true,
  // Disable source map upload until SENTRY_AUTH_TOKEN is configured
  disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  // Sentry's automatic wrapping of API route handlers conflicts with this
  // app's custom bodyParser:false/externalResolver:true proxy route,
  // producing an opaque 500 that bypasses the route's own try/catch.
  autoInstrumentServerFunctions: false,
});
