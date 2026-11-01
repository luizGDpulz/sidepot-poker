import type { Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  createSidepotServer,
  type CreateServerContextOptions,
  type SidepotServerContext,
} from './app.js';

export * from './security.js';
export * from './rate-limit.js';
export * from './room-manager.js';
export * from './ws-hub.js';
export * from './app.js';

export interface RunningSidepotServer extends SidepotServerContext {
  readonly httpServer: HttpServer;
  readonly port: number;
  close(): Promise<void>;
}

export function startSidepotHttpServer(
  port = 3000,
  hostname = '0.0.0.0',
  options: CreateServerContextOptions = {},
): Promise<RunningSidepotServer> {
  const ctx = createSidepotServer(options);

  return new Promise((resolvePromise) => {
    const server = serve(
      {
        fetch: ctx.app.fetch,
        port,
        hostname,
      },
      (info) => {
        const httpServer = server as unknown as HttpServer;
        ctx.wsHub.attachToServer(httpServer);
        ctx.startClockTicker(1000);

        resolvePromise({
          ...ctx,
          httpServer,
          port: info.port,
          close: () =>
            new Promise<void>((res, rej) => {
              ctx.stopClockTicker();
              ctx.wsHub.closeAll();
              httpServer.close((err) => {
                if (err) {
                  rej(err);
                } else {
                  res();
                }
              });
            }),
        });
      },
    );
  });
}

// Run standalone when invoked directly as entrypoint
const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const staticRootDir =
    process.env['STATIC_DIR'] ??
    resolve(fileURLToPath(new URL('../../client/dist', import.meta.url)));

  startSidepotHttpServer(port, host, { staticRootDir })
    .then((running) => {
      console.log(
        `[sidepot-server] Listening on http://${host}:${String(running.port)}`,
      );
      const shutdown = (): void => {
        void running.close().finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err: unknown) => {
      console.error('[sidepot-server] Startup failure:', err);
      process.exit(1);
    });
}
