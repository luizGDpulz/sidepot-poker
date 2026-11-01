import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIST_ASSETS_DIR = resolve(
  fileURLToPath(new URL('../dist/assets', import.meta.url)),
);

describe('/tv isolated Smart TV chunk budget & read-only security', () => {
  it('compiles TvDisplayView as an isolated lazy chunk strictly under 30 KB with zero mutation payloads', () => {
    expect(existsSync(DIST_ASSETS_DIR)).toBe(true);

    const files = readdirSync(DIST_ASSETS_DIR);
    const tvChunkFile = files.find(
      (f) => f.startsWith('TvDisplayView-') && f.endsWith('.js'),
    );
    expect(tvChunkFile).toBeDefined();

    const fullPath = join(DIST_ASSETS_DIR, tvChunkFile!);
    const byteSize = statSync(fullPath).size;

    // ADR-001 mandate: /tv chunk must stay strictly < 30 KB (30,720 bytes)
    expect(byteSize).toBeLessThan(30 * 1024);

    const code = readFileSync(fullPath, 'utf-8');
    // Verify zero Host or Player mutation commands leak into the Read-Only TV chunk
    expect(code).not.toContain('host:approve_join');
    expect(code).not.toContain('host:resolve_showdown');
    expect(code).not.toContain('host:adjust_stack');
    expect(code).not.toContain('game:action');
  });
});
