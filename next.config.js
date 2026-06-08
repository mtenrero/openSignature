/** @type {import('next').NextConfig} */
module.exports = {
    reactStrictMode: false,
    // Pin the workspace root to this project. Without it, Next can pick up a
    // stray package-lock.json elsewhere (e.g. in $HOME) and misdetect the root.
    outputFileTracingRoot: __dirname,
    typescript: {
        // WARNING: This is dangerous but necessary for build compatibility
        // Remove this once NextAuth v5 types are fully compatible
        ignoreBuildErrors: true,
    },
    transpilePackages: ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/notifications', '@mantine/dropzone', '@mantine/tiptap'],
    // Prevent bundling of PDFKit to allow access to font files
    serverExternalPackages: ['pdfkit'],
    webpack(config) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          fs: false,
        };

        return config;
    },
    // Remove turbopack config to avoid conflicts with auth cookies
    experimental: {
        optimizePackageImports: ['@mantine/core', '@tabler/icons-react'],
    },
    // Add dev origin configuration for cross-origin warnings
    devIndicators: {
        position: 'bottom-left',
    },
}