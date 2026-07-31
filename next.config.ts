import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root; a stray lockfile above this directory otherwise
  // makes Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
