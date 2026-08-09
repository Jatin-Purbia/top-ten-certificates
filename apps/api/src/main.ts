import { createApp } from './create-app.js';

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  if (process.env.NODE_ENV !== 'production') console.info(`API ready on http://localhost:${port}`);
}
void bootstrap();
