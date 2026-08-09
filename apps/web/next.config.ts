import type { NextConfig } from 'next';
// The CSP must allow whatever origin NEXT_PUBLIC_API_URL actually points to
// (localhost in dev, the deployed API in production) — hardcoding it here
// would silently block every API request once the frontend moves off localhost.
const parseOrigin = (value: string | undefined) => {
  try {
    return new URL((value ?? '').trim()).origin;
  } catch {
    return 'http://localhost:4000';
  }
};
// A malformed NEXT_PUBLIC_API_URL (e.g. a mis-pasted dashboard env var) must
// not hard-crash the production build — fall back to a safe default instead.
const apiOrigin = parseOrigin(process.env.NEXT_PUBLIC_API_URL);
const config:NextConfig={transpilePackages:['@pathey/ui','@pathey/types'],async headers(){return[{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Content-Security-Policy',value:`default-src 'self'; connect-src 'self' ${apiOrigin}; img-src 'self' data: blob:; frame-src 'self' ${apiOrigin}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:`}]}]}};
export default config;
