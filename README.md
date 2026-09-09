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

Tune with the on-screen zapper, the **0–9** number keys, **T** for the tape, or **▲ / ▼**.

**Created by Lukas Chmiel and Robert Inoma.**

## Channels

Every market category is a channel; the network's other surfaces are channels too.

| CH | Channel  | Airs | Source |
|----|----------|------|--------|
| 00 | WIRE     | what moved in the last 24h — one story per event, biggest mover first | `/api/situations` |
| 01 | SPORT    | live sport markets | channel clock, else schedule |
| 02 | CRYPTO   | live crypto markets | channel clock, else schedule |
| 03 | POLITICS | live politics markets | channel clock, else schedule |
| 04 | CULTURE  | live culture markets | channel clock, else schedule |
| 05 | MUSIC    | live music markets | channel clock, else schedule |
| 06 | NEWS     | live news markets | channel clock, else schedule |
| 07 | SCIENCE  | live science markets | channel clock, else schedule |
| 08 | RANK     | network operator board — public field records merged across every station | `/api/network/operators` |
| 09 | GUIDE    | top markets across the protocol | `/api/polymarket/featured` |
| 10 | TAPE     | the federated clip reel, played as a channel (HLS) | `/api/network/tapes` |

When the canonical **channel clock** carries a lane, that lane's NOW PLAYING is
the content segment on air right now and UP NEXT is the rundown with real start
times; the masthead shows `CHANNEL CLOCK LIVE`. When it does not, the channel
falls back to the legacy schedule (ON AIR first, else soonest to resolve).

A channel with nothing to air shows the animated **NO SIGNAL** dead-channel
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
VITE_DENPA_WEB=https://denpa.ai                              # markets / clock / charts / situations / network
```

## Protocol surfaces this fork wires (all CORS-open reads, no auth)

```
GET denpa.ai/api/broadcast/program?preset=resolving        # canonical channel clock (lanes → rundown)
GET denpa.ai/api/broadcast/schedule?cat=sport              # legacy schedule (fallback)
GET denpa.ai/api/polymarket/featured                       # heatmap tiles (GUIDE + ticker)
GET denpa.ai/api/polymarket/market-history?marketId=ID&interval=1H   # YES chart (legacy /history as fallback)
GET denpa.ai/api/situations?window=24h&limit=30            # WIRE — stories of belief movement
GET denpa.ai/api/network/tapes?limit=20                    # TAPE — federated clips (HLS)
GET denpa.ai/api/network/operators                         # RANK — merged operator board
GET api-production-802f5.up.railway.app/api/v1/signals/leaderboard?operators=human   # RANK fallback
```

Filing a SIGNAL is a write: `POST denpa.ai/api/predictions` with a `dk_` key,
proxied through your own server route (not CORS-open). This fork links to the
denpa.ai market page instead. Keys: https://denpa.ai/developer.

denpa.ai sends `Access-Control-Allow-Origin` to fork origins, so the browser
reads it cross-origin from `localhost` or any deployed fork domain.

## Structure

```
src/
  App.tsx        the broadcast set — channels, zapper, now-playing screen, WIRE, TAPE player, listings, ticker
  lib/denpa.ts   typed denpa.ai client (clock / schedule / heatmap / history / situations / tapes / operators / CHANNELS)
  index.css      black, blocky monospace base
```

Only runtime dependency beyond React: `hls.js` for the TAPE channel (loaded
first; Safari falls back to native HLS).

## Extending the fork

- **Add a channel:** push to `CHANNELS` in `src/lib/denpa.ts` with a schedule
  category.
- **Reskin:** the whole look is the `TT` palette in `App.tsx` — swap it for your
  vertical's theme.
- **SIGNAL writes:** go through the denpa.ai signal API (key-gated) — not a second
  source of truth. Keep one canonical signal per the protocol.

## Changelog

- **0.2.0 (2026-09-09)** — wired to the current protocol: canonical channel clock
  drives NOW PLAYING / UP NEXT; CH 00 WIRE (situations); CH 10 TAPE (federated
  clips, HLS); RANK becomes the network operator board across stations; chart
  reads the documented `market-history` endpoint; React 19, Vite 8.
- **0.1.0 (2026-06-29)** — Fork Zero: nine channels, zapper, now-playing screen,
  60-minute YES chart, EPG, leaderboard, MIT.

## Credits

Created by **Lukas Chmiel** and **Robert Inoma**. Built on the Denpa protocol.

## License

MIT — see [LICENSE](./LICENSE). Clone it, reskin it, ship your own vertical.

Not financial advice.
