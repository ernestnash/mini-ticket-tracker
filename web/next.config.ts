import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  // The browser calls /api/* on the same origin and Next forwards it to the Express API,
  // so the API needs no CORS configuration.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default config;
