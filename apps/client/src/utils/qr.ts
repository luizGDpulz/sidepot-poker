export interface GeneratedRoomLinks {
  readonly playerJoinUrl: string;
  readonly tvDisplayUrl: string;
}

export function resolveCandidateOrigins(
  currentOrigin: string,
  protocol: string,
  hostname: string,
  port: string,
  lanAddresses: readonly string[],
): string[] {
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';

  const portSuffix = port ? `:${port}` : '';
  const lanOrigins = lanAddresses.map(
    (ip) => `${protocol}//${ip}${portSuffix}`,
  );

  const ordered = isLoopback
    ? [...lanOrigins, currentOrigin]
    : [currentOrigin, ...lanOrigins];

  return Array.from(new Set(ordered));
}

export function generateInviteUrls(
  baseOrigin: string,
  roomId: string,
  inviteToken: string,
  displayToken: string,
): GeneratedRoomLinks {
  const cleanOrigin = baseOrigin.replace(/\/+$/, '');
  const joinParams = new URLSearchParams({
    room: roomId,
    invite: inviteToken,
  });
  const tvParams = new URLSearchParams({
    token: displayToken,
  });

  return {
    playerJoinUrl: `${cleanOrigin}/join?${joinParams.toString()}`,
    tvDisplayUrl: `${cleanOrigin}/tv/${encodeURIComponent(roomId)}?${tvParams.toString()}`,
  };
}

export async function renderQrSvg(targetUrl: string): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toString(targetUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark: '#f4f4f5',
      light: '#18181b',
    },
  });
}
