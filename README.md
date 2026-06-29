# DENPA — The New Media Primitive · Fork Zero

## What is Denpa

**Denpa is a new media primitive: every prediction market becomes a live,
programmable media surface.** You watch a market move, file a YES/NO **signal**,
explain your call, and build a public **field record** of your judgment. The loop
is the product:

> **Watch → Signal → Explain → Resolve → Rank → Follow**

This repo — **Fork Zero** — is the reference client for that primitive: a live
broadcast of market signals you can clone, reskin and ship as your own vertical.
It owns its surface (a static-TV broadcast set); markets, signals, charts,
operators and the schedule all resolve **through denpa.ai** — there is no second
backend.

Tune with the on-screen zapper, the **1–9** number keys, or **▲ / ▼**.

## Channels

Every market category is a channel.

| CH | Channel  | Airs |
|----|----------|------|
| 01 | SPORT    | live sport markets |
| 02 | CRYPTO   | live crypto markets |
| 03 | POLITICS | live politics markets |
| 04 | CULTURE  | live culture markets |
| 05 | MUSIC    | live music markets |
| 06 | NEWS     | live news markets |
| 07 | SCIENCE  | live science markets |
| 08 | RANK     | operator leaderboard — public field records |
| 09 | GUIDE    | top markets across the protocol |

A channel with no live markets shows the animated **NO SIGNAL** dead-channel
screen. Every feed refreshes every 30s and fails independently.

## What each market channel airs

- **NOW PLAYING** — the on-air (or soonest-resolving) market for the channel
- **YES / NO** — live split bars
- **CHART** — 60 min of 1-minute YES price history + a live ▲/▼ change readout
- **RESOLVES IN** — live countdown
- **GUIDE — UP NEXT** — the channel's listings
- **▸ SIGNAL YES / NO** — opens the denpa.ai market page to file a forecast
  (money-free; one canonical signal per the protocol)

## Run

```bash
cp .env.example .env   # endpoints are already correct; edit only to repoint
npm install
npm run dev            # http://localhost:5173
```

## Config

`.env` (Vite) — both point at denpa.ai infrastructure:

```
VITE_DENPA_API=https://api-production-802f5.up.railway.app   # signal leaderboard
VITE_DENPA_WEB=https://denpa.ai                              # markets / schedule / charts
```

denpa.ai sends `Access-Control-Allow-Origin` to fork origins, so the browser
reads it cross-origin from `localhost` or any deployed fork domain.

## Structure

```
src/
  App.tsx        the broadcast set — channels, zapper, now-playing screen, listings, ticker
  lib/denpa.ts   typed denpa.ai client (leaderboard / markets / schedule / history / CHANNELS)
  index.css      black, blocky monospace base
```

## Extending the fork

- **Add a channel:** push to `CHANNELS` in `src/lib/denpa.ts` with a schedule
  category.
- **Reskin:** the whole look is the `TT` palette in `App.tsx` — swap it for your
  vertical's theme.
- **SIGNAL writes:** go through the denpa.ai signal API (key-gated) — not a second
  source of truth. Keep one canonical signal per the protocol.

## License

MIT — see [LICENSE](./LICENSE). Clone it, reskin it, ship your own vertical.

Built on the Denpa protocol. Not financial advice.
