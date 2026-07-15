import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface FixtureServer {
  port: number;
  stop: () => Promise<void>;
}

/**
 * Throwaway local HTTP server serving `dir`'s files by filename on an
 * ephemeral port — the only way to hand `parsePdfFromUrl(fileUrl)` a
 * local fixture PDF without modifying it, since this Node runtime's
 * `fetch()` does not support `file://` URLs (research.md R4).
 */
export function startFixtureServer(dir: string): Promise<FixtureServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      const filename = decodeURIComponent((req.url ?? '/').replace(/^\/+/, ''));
      readFile(join(dir, filename))
        .then((data) => {
          res.writeHead(200, { 'Content-Type': 'application/pdf' });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end('Not found');
        });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Fixture server failed to bind to a port'));
        return;
      }
      resolve({
        port: address.port,
        stop: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
