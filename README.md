# DENPA FORK ZERO

A **Ceefax / static-TV** protocol fork of [Denpa](https://denpa.ai). The fork owns
its surface (a teletext page over CRT scanlines); markets, signals and the
broadcast schedule all resolve **through denpa.ai** — there is no second backend.

This is the reference shape for a Denpa fork: own theme, own surface, data over
HTTP from the shared protocol APIs (Layer 14).

## What it shows

- **TOP MARKETS** — `denpa.ai/api/polymarket/featured` (home heatmap tiles)
- **SIGNAL LEADERBOARD** — `api-production…/api/v1/signals/leaderboard` (human operators)
- **BROADCAST** — `denpa.ai/api/broadcast/schedule` (markets resolving = listings)
- **NO SIGNAL** — animated TV-static dead-channel screen while tuning / when empty

All three feeds refresh every 30s and fail independently (a down feed just hides
its section; the others keep airing).

## Run

```bash
cp .env.example .env   # endpoints are already correct; edit only to repoint
npm install
npm run dev            # http://localhost:5173
```

## Config

`.env` (Vite):

```
VITE_DENPA_API=https://api-production-802f5.up.railway.app   # leaderboard / signals
VITE_DENPA_WEB=https://denpa.ai                              # heatmap / broadcast
```

Both backends send `Access-Control-Allow-Origin` to fork origins, so the browser
can read them cross-origin from `localhost` or any deployed fork domain.

## Structure

```
src/
  App.tsx        the teletext surface (sections + TV static + FastText bar)
  lib/denpa.ts   typed protocol client (leaderboard / heatmap / schedule)
  index.css      teletext base (black, blocky monospace)
```

## Extending the fork

- Change the vertical: pass a different `cat` to `fetchSchedule()` (`music`,
  `crypto`, `politics`, …) and filter `fetchHeatmap()` tiles.
- Add SIGNAL capture / writes: go through the API service (API-key gated) — not
  a second source of truth. Keep one canonical signal per the protocol.

Built on the Denpa protocol. Not financial advice.
