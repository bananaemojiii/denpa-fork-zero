# DENPA — The New Media Primitive · Fork Zero

## Manifesto

**We are building a new media distribution machine.** Not a channel network: a
broadcast protocol where every prediction market is a live, programmable media
surface, and a market page is not a scoreboard but a transmitter. The old
machine distributed shows on a schedule; this one distributes markets by
attention — what airs is what gets discovered, and airing is a timestamped
protocol event: the clock puts a market on screen, the market moves, the move
is measured. The primitive is the **filed call**: a public YES/NO signal with a
snapshot of the market at call time, a take with a face on it, and a receipt —
resolved by reality, scored into a public field record. Watching, calling and
distributing are one gesture. Fork the surface; the distribution resolves
through denpa.ai.

> **Watch → Signal → Explain → Air → Move → Resolve → Rank → Follow**

## Fork Zero

This repo is the reference client for that primitive: a live broadcast of
market signals you can clone, reskin and ship as your own station. It owns its
surface (a static-TV broadcast set); the clock, markets, stories, tapes,
operators and field records all resolve **through denpa.ai** — there is no
second backend.

Tune with the on-screen zapper, the **0–9** number keys, **T** for the tape, or **▲ / ▼**.
**SPACE** (or **P**, or the ❚❚ PAUSE button) pauses the autocut — the now-playing market and the tape hold; the clock keeps ticking, so PLAY re-syncs to the rundown. Zapping resumes.

**Created by Lukas Chmiel and Robert Inoma.**

**Live:** https://bananaemojiii.github.io/denpa-fork-zero/ — GitHub Pages, built
from `main` on every push (`.github/workflows/pages.yml`).

## What denpa.ai is today (September 2026)

- **The home page is a TV.** Denpa TV rotates through the markets on air, and
  the rotation *is* the distribution policy: a live operator on a market first,
  then markets carrying takes, then what THE WIRE says moved, then segments in
  their final stretch, then the rest of the clock. What airs is what gets
  discovered.
- **The channel clock is a protocol service.** `program-clock` turns resolving
  markets into a real-time rundown (content segments with 10s bumpers between
  them, self-filling hours ahead). denpa.ai serves its own rundown at
  `/api/broadcast/program` — lanes **SPORTS · MUSIC · FILM · TV · FASHION ·
  CRYPTO** — and the same clock scoped to any station's venues and lanes at
  `/api/network/program?providers=polymarket,kalshi&categories=…`.
- **THE WIRE + SITUATIONS.** Markets ranked by how much belief *moved*, not by
  volume, and every event collapsed into one story (lanes POLITICS · CRYPTO ·
  SPORT · CULTURE · MUSIC · TECH · ECONOMY · SCIENCE · WORLD · ENTERTAINMENT).
- **THE TAPE.** The federated clip reel across the network. On a denpa.ai market
  page the tape airs the market's own takes first; the ambient reel is reranked
  to the market's question by embeddings.
- **Field records.** Every operator's public judgment history — rank, score,
  accuracy, streak, closing-line value, receipts — served by the hub at
  `/api/network/field-record/[handle]`; the operator board merges every station.
- **The Network.** denpa.ai (culture · Polymarket) · cee.news (news · Kalshi) ·
  basetv.tv (Base · Limitless) · pund.it — one protocol, with tapes, operators,
  identity and the clock federated through the denpa.ai hub. `/network` shows
  them all.
- **Keys + MCP.** `dk_` keys mint at `/developer`; `POST /api/predictions`
  files a SIGNAL. An MCP server at `denpa.ai/api/mcp` lets an agent drive an
  operator surface — push a SIGNAL to the live page and OBS overlay, bind a
  stream to a market, go live.
- **Play/pause holds the pick, never the clock** — the same rule on web, iOS
  and this fork.

## Program view

The dial is the clock. CH 1–6 are the lanes of the denpa.ai channel clock —
the rundown the denpa.ai home TV rotates through — and the rest are the
protocol's other live surfaces.

| CH | Channel | Airs | Source |
|----|---------|------|--------|
| 0 | WIRE    | what moved in the last 24h — one story per event, biggest mover first | `/api/situations` |
| 1 | SPORTS  | the SPORTS lane of the denpa.ai channel clock | channel clock, else legacy schedule |
| 2 | MUSIC   | the MUSIC lane | channel clock, else legacy schedule |
| 3 | FILM    | the FILM lane | channel clock |
| 4 | TV      | the TV lane | channel clock |
| 5 | FASHION | the FASHION lane | channel clock |
| 6 | CRYPTO  | the CRYPTO lane | channel clock, else legacy schedule |
| 7 | RANK    | network operator board merged across every station — select an operator to open their public field record (rank, score, accuracy, streak, CLV, recent calls with receipts) | `/api/network/operators` · `/api/network/field-record` |
| 8 | GUIDE   | top markets across the protocol | `/api/polymarket/featured` |
| 9 | TAPE    | the federated clip reel, played as a channel (HLS) | `/api/network/tapes` |

NOW PLAYING is the content segment on air right now, UP NEXT is the rundown
with real start times, and the masthead shows `CHANNEL CLOCK LIVE`. When the
clock is unwired, a lane with a legacy schedule category falls back to it (ON
AIR first, else soonest to resolve); the others go to dead air. Other lanes
(politics, news, science) live on other stations — a fork asks the hub for its
own clock: `/api/network/program?providers=kalshi&categories=politics,news`.

A lane with nothing to air shows the animated **NO SIGNAL** screen. Every feed
refreshes every 30s and fails independently.

## What each lane airs

- **NOW PLAYING** — the on-air (or soonest-resolving) market for the lane
- **YES / NO** — live split bars
- **CHART** — 60 min of 1-minute YES price history + a live ▲/▼ change readout
- **CHANNEL CLOCK — NEXT IN / RESOLVES IN** — live countdown
- **UP NEXT** — the lane's rundown
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
VITE_DENPA_WEB=https://denpa.ai                              # clock / markets / charts / situations / network
```

## Protocol surfaces this fork wires (all CORS-open reads, no auth)

```
GET denpa.ai/api/broadcast/program?preset=default          # the denpa.ai channel clock (lanes → rundown); hot · resolving · close too
GET denpa.ai/api/broadcast/schedule?cat=sport              # legacy schedule (fallback; sport · music · crypto here)
GET denpa.ai/api/polymarket/featured                       # heatmap tiles (GUIDE + ticker)
GET denpa.ai/api/polymarket/market-history?marketId=ID&interval=1H   # YES chart (legacy /history as fallback)
GET denpa.ai/api/situations?window=24h&limit=30            # WIRE — stories of belief movement (never sum a story's deltas)
GET denpa.ai/api/network/tapes?limit=20                    # TAPE — federated clips (HLS)
GET denpa.ai/api/network/operators                         # RANK — merged operator board
GET denpa.ai/api/network/field-record/HANDLE               # RANK — an operator's public field record (+ receipt URLs)
GET api-production-802f5.up.railway.app/api/v1/signals/leaderboard?operators=human   # RANK fallback
```

Also CORS-open on the same hub, not wired here yet — the natural next steps for
a fork:

```
GET denpa.ai/api/network/program?providers=kalshi&categories=politics,news   # your station's own clock
GET denpa.ai/api/network/market/ID                         # one normalized market shape for any protocol id
GET denpa.ai/api/network/crowd                             # crowd consensus vs market price, per market
GET denpa.ai/api/network/pulse                             # the protocol's traction series
```

Filing a SIGNAL is a write: `POST denpa.ai/api/predictions` with a `dk_` key,
proxied through your own server route (not CORS-open). This fork links to the
denpa.ai market page instead. Keys: https://denpa.ai/developer. `/api/wire` is
not CORS-open either — fetch it server-side; `/api/situations` is.

denpa.ai sends `Access-Control-Allow-Origin: *` on these prefixes, so the
browser reads them cross-origin from `localhost` or any deployed fork domain.

## Structure

```
src/
  App.tsx        the broadcast set — channels, zapper, now-playing screen, WIRE, TAPE player, rundown, ticker
  lib/denpa.ts   typed denpa.ai client (clock / schedule / heatmap / history / situations / tapes / operators / field record / CHANNELS)
  index.css      black, blocky monospace base
```

Only runtime dependency beyond React: `hls.js` for the TAPE channel (loaded
first; Safari falls back to native HLS).

## Extending the fork

- **Add a channel:** push to `CHANNELS` in `src/lib/denpa.ts` with a clock
  `lane` key (and a legacy `cat` only where the schedule route knows it).
- **Reskin:** the whole look is the `TT` palette in `App.tsx` — swap it for your
  station's theme.
- **Your own clock:** point the market channels at
  `/api/network/program?providers=…&categories=…` for a station on other
  venues or lanes — same shape, no env var.
- **SIGNAL writes:** go through the denpa.ai signal API (key-gated) — not a second
  source of truth. Keep one canonical signal per the protocol.

## Changelog

- **0.2.3 (2026-09-09)** — hosted: GitHub Pages workflow builds `main` to
  bananaemojiii.github.io/denpa-fork-zero (Vite `base` from `BASE_PATH`).
- **0.2.2 (2026-09-09)** — RANK opens field records: selecting an operator pulls
  their public field record from the hub (`/api/network/field-record`) — rank,
  score, accuracy, W–L, open calls, streak, average CLV, recent calls with
  receipts; ESC / BACK returns to the board; no hub record → dead air + the
  station page.
- **0.2.1 (2026-09-09)** — manifesto + program view; the dial mirrors denpa.ai: CH 1–6 are the lanes the
  denpa.ai home TV airs (SPORTS · MUSIC · FILM · TV · FASHION · CRYPTO) read
  from `preset=default`; POLITICS / CULTURE / NEWS / SCIENCE retired (not on
  denpa.ai's clock); RANK / GUIDE / TAPE renumbered to 7 / 8 / 9 so the dial is
  0–9; README rewritten around the current protocol.
- **0.2.0 (2026-09-09)** — wired to the current protocol: canonical channel clock
  drives NOW PLAYING / UP NEXT; CH 0 WIRE (situations); TAPE (federated clips,
  HLS); RANK becomes the network operator board across stations; chart reads
  the documented `market-history` endpoint; play/pause; React 19, Vite 8.
- **0.1.0 (2026-06-29)** — Fork Zero: nine channels, zapper, now-playing screen,
  60-minute YES chart, EPG, leaderboard, MIT.

## Credits

Created by **Lukas Chmiel** and **Robert Inoma**. Built on the Denpa protocol.

## License

MIT — see [LICENSE](./LICENSE). Clone it, reskin it, ship your own station.

Not financial advice.
