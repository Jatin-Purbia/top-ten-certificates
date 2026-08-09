import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/create-app.js';

// Vercel invokes this function per-request rather than running a long-lived
// process, so the Nest app (and its Mongo connection pool) is built once and
// cached across warm invocations instead of on every request.
let appPromise: ReturnType<typeof createApp> | undefined;
const getApp = () => (appPromise ??= createApp().then(async (app) => { await app.init(); return app; }));

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  const instance = app.getHttpAdapter().getInstance();
  instance(req, res);
}
