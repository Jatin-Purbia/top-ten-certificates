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
// API_ORIGIN (server-only — no NEXT_PUBLIC_ prefix, never sent to the
// browser) is the real backend the rewrite below proxies to. This is what
// makes the public claim-session cookie work in Safari: Safari's
// Intelligent Tracking Prevention silently discards cookies set by a
// genuinely cross-site response (the web app on vercel.app calling an API
// on onrender.com is cross-site no matter what SameSite/Secure say) — no
// cookie attribute fixes that, only not being cross-site does. Proxying
// /api/v1/* through this site's own domain makes the browser see a
// same-origin response, so the cookie is first-party.
const backendOrigin = process.env.API_ORIGIN;
const config:NextConfig={transpilePackages:['@pathey/ui','@pathey/types','@pathey/hindi-text'],async rewrites(){return backendOrigin?[{source:'/api/v1/:path*',destination:`${backendOrigin}/api/v1/:path*`}]:[]},async headers(){return[{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Content-Security-Policy',value:`default-src 'self'; connect-src 'self' ${apiOrigin}; img-src 'self' data: blob:; frame-src 'self' ${apiOrigin} blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:`}]}]}};
export default config;
