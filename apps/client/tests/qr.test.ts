import { describe, expect, it } from 'vitest';
import {
  generateInviteUrls,
  renderQrSvg,
  resolveCandidateOrigins,
} from '../src/utils/qr.js';

describe('@sidepot/client QR Code & LAN origin helpers', () => {
  it('prioritizes LAN IPv4 origins over localhost for smartphone scanning', () => {
    const origins = resolveCandidateOrigins(
      'http://localhost:3000',
      'http:',
      'localhost',
      '3000',
      ['192.168.1.42'],
    );
    expect(origins[0]).toBe('http://192.168.1.42:3000');
    expect(origins[1]).toBe('http://localhost:3000');
  });

  it('keeps public HTTPS domain first when accessed via reverse proxy', () => {
    const origins = resolveCandidateOrigins(
      'https://poker.falcon.example',
      'https:',
      'poker.falcon.example',
      '',
      ['10.0.0.5'],
    );
    expect(origins[0]).toBe('https://poker.falcon.example');
  });

  it('builds encoded Player Invite and Read-Only /tv URLs and renders inline SVG', async () => {
    const links = generateInviteUrls(
      'http://192.168.1.42:3000/',
      'friday-room',
      'inv_token_123',
      'tv_token_456',
    );
    expect(links.playerJoinUrl).toBe(
      'http://192.168.1.42:3000/join?room=friday-room&invite=inv_token_123',
    );
    expect(links.tvDisplayUrl).toBe(
      'http://192.168.1.42:3000/tv/friday-room?token=tv_token_456',
    );

    const svg = await renderQrSvg(links.playerJoinUrl);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
