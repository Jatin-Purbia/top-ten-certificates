import type { NextConfig } from 'next';
// The CSP must allow whatever origin NEXT_PUBLIC_API_URL actually points to
// (localhost in dev, the deployed API in production) — hardcoding it here
// would silently block every API request once the frontend moves off localhost.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').origin;
const config:NextConfig={transpilePackages:['@pathey/ui','@pathey/types'],async headers(){return[{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Content-Security-Policy',value:`default-src 'self'; connect-src 'self' ${apiOrigin}; img-src 'self' data: blob:; frame-src 'self' ${apiOrigin}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:`}]}]}};
export default config;
