# ♠ Sidepot (`sidepot-poker`)

> **Real-time poker chip counter & tournament manager for live physical-card games (Texas Hold'em / Omaha).**  
> Keep the tactile magic of real cards at the table while automating chip stacks, multi-way side pots, blind timers, and Smart TV standings from everyone's smartphone.

[![CI](https://github.com/luizGDpulz/sidepot-poker/actions/workflows/ci.yml/badge.svg)](https://github.com/luizGDpulz/sidepot-poker/actions/workflows/ci.yml)
[![Docker GHCR](https://github.com/luizGDpulz/sidepot-poker/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/luizGDpulz/sidepot-poker/pkgs/container/sidepot-poker)
[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-10b981.svg)](./LICENSE)

---

## ✨ Key Features

- **Zero-Install QR Code Onboarding:** The Host creates a table in seconds and displays an inline SVG QR Code (automatically prioritizing LAN IPv4 addresses on local Wi-Fi or HTTPS domains on a VPS). Players scan and join from iOS Safari or Android Chrome.
- **TDA-Compliant Poker Engine (`@sidepot/core`):**
  - Exact integer chip conservation across multi-way `ALL_IN` scenarios and iterative **Main Pot + Side Pot** slicing.
  - **Poker TDA Rule 47A & 47B:** Non-reopening short all-ins and cumulative short all-in raise reopening.
  - **Poker TDA Rule 20:** Deterministic odd-chip distribution in Split Pots starting from the first eligible seat left of the Dealer button.
  - **Poker TDA Rule 14:** Simultaneous multi-player bustout ranking ordered by starting-hand chip stack.
  - **Host Safety Net:** Bounded immutable `Undo` history stack, manual stack adjustments, Re-buys, and Add-ons between hands.
- **4-Layer Live Room Security:**
  1. **Ephemeral Invite Token (`inv_*`):** Required simply to knock on the room lobby.
  2. **Host Bouncer Queue:** Players wait in a virtual lobby until the Host explicitly taps **Approve** on their screen.
  3. **Anti-Impersonation Session Token (`ply_*`):** Each approved seat receives a unique cryptographic session token bound strictly to that `playerId` — players can never spoof actions for another seat.
  4. **Lock Room & Edge Rate Limiting:** 1-tap room lock once everyone is seated, backed by sliding-window IP rate limiting (`cf-connecting-ip` / `x-forwarded-for` aware).
- **Isolated `< 30 KB` Smart TV Display (`/tv`):**
  - Lazy-loaded read-only broadcast view (`~10 KB` minified JS chunk, enforced in CI) authenticated via a dedicated `DISPLAY` token (`tv_*`) blocked at the WebSocket hub from mutating game state.
  - Features a 16:9 oval poker table, live blind clock, side pots, Champion Podium overlay, and automatic **Screen Wake Lock API** activation.
- **Mobile-First Ergonomics:** Dark Minimalist OLED palette (`#09090b`), `tabular-nums` chip counters, one-handed bottom thumb-zone actions, 1-tap Raise presets (`Min`, `2.5x`, `1/2 Pot`, `Pot`, `All-In`), Web Vibration turn alerts, synthesized Web Audio blind level-up chimes, and bilingual `pt-BR` / `en` UI.

---

## 🐳 Quickstart — Self-Hosting via Pre-Built Container (GHCR)

Sidepot publishes official multi-architecture (**`linux/amd64`** and **`linux/arm64`**) pre-built Docker images to **GitHub Container Registry**:

```text
ghcr.io/luizgdpulz/sidepot-poker:latest
```

No repository clone, Node.js installation, or server-side compilation is required in production.

### Option A: Production VPS / Homelab Behind a Reverse Proxy (Recommended)

Copy [`compose.yml`](./compose.yml) into `/srv/docker/sidepot-poker/compose.yml` (isolated on `proxy-net` with `expose: ["3000"]`, `no-new-privileges:true`, and zero `0.0.0.0` host port binds):

```yaml
services:
  sidepot-poker:
    image: ghcr.io/luizgdpulz/sidepot-poker:latest
    container_name: sidepot-poker
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: "3000"
    expose:
      - "3000"
    networks:
      - proxy-net

networks:
  proxy-net:
    external: true
```

Deploy or update in two commands:

```bash
docker compose pull
docker compose up -d
```

Point your reverse proxy (Caddy, Traefik, Nginx, or Cloudflare Tunnel) to `http://sidepot-poker:3000` (WebSocket upgrades on `/ws` work automatically out of the box).

### Option B: Instant Home Wi-Fi / LAN Container

To run Sidepot directly on your laptop or home server for a local game night over Wi-Fi:

```bash
docker run -d \
  --name sidepot-poker \
  --restart unless-stopped \
  -p 3000:3000 \
  ghcr.io/luizgdpulz/sidepot-poker:latest
```

Open `http://localhost:3000` to create your tournament and display the Wi-Fi QR Code for players and the living room Smart TV.

---

## 🏛️ Monorepo Architecture

```text
sidepot-poker/
├── packages/
│   └── core/          # @sidepot/core — Pure TypeScript TDA poker state machine & protocol types
├── apps/
│   ├── server/        # @sidepot/server — Hono REST API, ws WebSocket Hub, Bouncer & static SPA server
│   └── client/        # @sidepot/client — Vue 3 + Vite + Tailwind CSS v4 PWA & isolated /tv route
├── Dockerfile         # Hardened multi-stage build (node:24-alpine, pnpm deploy --prod, non-root USER node)
└── compose.yml        # Pull-only production stack for GHCR deployment
```

---

## 🛠️ Local Development

Requires **Node.js `>= 22`** and **`pnpm`**.

```bash
# Install workspace dependencies
pnpm install

# Build all packages (@sidepot/core, @sidepot/server, @sidepot/client)
pnpm build

# Run ESLint, TypeScript + vue-tsc typechecks, and Vitest suite
pnpm lint
pnpm typecheck
pnpm test
```

---

## 📄 License

Distributed under the **GNU Affero General Public License v3.0 (`AGPL-3.0-only`)**. See [`LICENSE`](./LICENSE) for full details.
