import { Hono } from 'hono';

export function createBaseApp(): Hono {
  const app = new Hono();
  app.get('/healthz', (c) =>
    c.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) }),
  );
  return app;
}
