# DENPA IPTV — FORK ZERO

A **prediction-television** protocol fork of [Denpa](https://denpa.ai), styled as
a **Ceefax / static-TV** set. Every market category is a **channel**; each channel
airs its hottest market as a "now playing" segment with a live YES/NO split, a
60-minute price chart, a countdown to resolution, and SIGNAL actions. Tune with
the on-screen zapper, the **1–9** number keys, or **▲ / ▼**.

The fork owns its surface; markets, signals, charts, operators and the broadcast
schedule all resolve **through denpa.ai** — there is no second backend. This is
the reference shape for a Denpa fork (Layer 14 protocol APIs over HTTP) and a
clone-and-run starting point for building your own vertical.

## Channels

| CH | Channel  | Source |
|----|----------|--------|
| 01 | SPORT    | `broadcast/schedule?cat=sport` |
| 02 | CRYPTO   | `…?cat=crypto` |
| 03 | POLITICS | `…?cat=politics` |
| 04 | CULTURE  | `…?cat=culture` |
| 05 | MUSIC    | `…?cat=music` |
| 06 | NEWS     | `…?cat=news` |
| 07 | SCIENCE  | `…?cat=science` |
| 08 | RANK     | `api…/v1/signals/leaderboard` — operator field records |
| 09 | GUIDE    | `polymarket/featured` — top markets across the protocol |

A channel with no live markets shows the animated **NO SIGNAL** dead-channel
screen — authentic dead air. Every feed refreshes every 30s and fails
independently.

## What each market channel airs

- **NOW PLAYING** — the ON-AIR (or soonest-resolving) market for the channel
- **YES / NO** — live split bars (green YES, cyan NO)
- **CHART** — 60 min of 1-minute YES price history (`polymarket/history`)
- **RESOLVES IN** — live countdown
- **GUIDE — UP NEXT** — the channel's EPG (upcoming listings)
- **▸ SIGNAL YES / NO** — opens the denpa.ai market page to file a forecast
  (money-free; one canonical signal per the protocol)

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
VITE_DENPA_WEB=https://denpa.ai                              # heatmap / schedule / charts
```

Both backends send `Access-Control-Allow-Origin` to fork origins, so the browser
reads them cross-origin from `localhost` or any deployed fork domain.

## Structure

```
src/
  App.tsx        the IPTV set — channels, zapper, now-playing screen, EPG, ticker
  lib/denpa.ts   typed protocol client (leaderboard / heatmap / schedule / history / CHANNELS)
  index.css      teletext base (black, blocky monospace)
```

## Extending the fork

- **Add a channel:** push to `CHANNELS` in `src/lib/denpa.ts` with a schedule
  `cat`. The categorizer's vocabulary lives in the Denpa monorepo
  (`services/program-clock/src/categories.ts`).
- **Reskin:** the whole look is the `TT` teletext palette in `App.tsx` — swap it
  for your vertical's theme.
- **SIGNAL writes:** go through the API service (API-key gated) — not a second
  source of truth. Keep one canonical signal per the protocol.

Built on the Denpa protocol. Not financial advice.
