# AGENTS.md — DENPA · FORK ZERO

Instructions for any AI (Claude Code, etc.) working in this repo. This is the
**reference fork** of the [Denpa protocol](https://denpa.ai): a static-TV
broadcast surface where a long-running market IS a channel (the marquee band,
CH 1–6), plus WIRE (situations), RANK (network operator board + field records),
GUIDE (the channel clock) and TAPE (federated clips).
Created by Lukas Chmiel and Robert Inoma.

## Golden rules

1. **Data resolves through denpa.ai — there is no `@denpa/sdk`.** All reads are
   public REST over HTTPS, CORS-enabled, no auth. Never invent an SDK; never
   block first paint on a WebSocket. Fetch the endpoints below and poll ~30s.
2. **The fork owns surface + theme only.** Do NOT reimplement Signal / Market /
   User / Outcome — those are Denpa core (Layer 14) and live upstream.
3. **Always render `<TvStatic/>` for loading / empty / error.** A panel stuck on
   "loading…" forever means a dead/SDK path was wired. Authentic dead air, never
   a spinner that never resolves.
4. **Surgical changes.** Match the existing teletext style; don't add deps,
   build tooling, or abstractions that weren't requested.

## Where things are

- `src/lib/denpa.ts` — the protocol client + `CHANNELS`. Exports:
  `fetchMarket` (any protocol id → one shape), `fetchMarquee` (the CH 1–6 band)
  + `MARQUEE_PINS` / `MARQUEE_SLOTS`, `fetchProgram` (channel clock, GUIDE),
  `fetchHeatmap`, `fetchHistory`, `fetchSituations` + `marketRoute`, `fetchTapes`,
  `fetchNetworkOperators`, `fetchFieldRecord`, `CHANNELS`, `denpaLinks`, and the
  `ProgramLane` / `ProgramSegment` / `BroadcastSegment` / `HeatmapTile` /
  `PricePoint` / `Situation` / `Tape` / `NetOperator` / `FieldRecord` / `DenpaMarket` / `MarqueeMarket` / `Channel` types.
- `src/App.tsx` — the broadcast surface: `TvStatic` (the static-TV placeholder),
  `Sparkline` (YES price chart; `fit` scales the axis to the traded range),
  `MarqueeScreen`, `WireBoard`, `FieldRecordView`, `TapePlayer`
  (hls.js first, native HLS fallback), the zapper, and the `TT` teletext
  palette (the whole look lives here).
- `src/index.css` — base (black, blocky monospace).

## Endpoints (all CORS-open, no auth for reads)

```
GET denpa.ai/api/broadcast/program?preset=default           # the denpa.ai channel clock ({enabled:false} when unwired; hot · resolving · close too)
GET denpa.ai/api/network/market/ID                          # any protocol id → normalized market ({market:{...}} envelope)
GET denpa.ai/api/polymarket/markets                         # auto-fill pool for the marquee band
GET denpa.ai/api/polymarket/featured                        # home heatmap tiles
GET denpa.ai/api/polymarket/market-history?marketId=ID&interval=ALL  # price history — 1H · 24H · 7D · ALL (legacy /history as fallback)
GET denpa.ai/api/situations?window=24h&limit=30             # stories of belief movement (never sum deltas)
GET denpa.ai/api/network/tapes?limit=20                     # federated clips (HLS manifests)
GET denpa.ai/api/network/operators                          # merged operator board
GET denpa.ai/api/network/field-record/HANDLE                # public field record (RANK row click; 404 → station page)
```

Configured via `.env` (`VITE_DENPA_WEB`); see `.env.example`. Everything above is
on the denpa.ai hub with `Access-Control-Allow-Origin: *`. Do NOT wire
`api-production-…/api/v1/*` from browser code: its CORS allowlist is `localhost`
+ `*.up.railway.app`, so it is blocked on any other deployed origin.
SIGNAL writes are `POST denpa.ai/api/predictions` with a `dk_` key through your
own server route (not CORS-open) — reads need nothing. `/api/wire` and
`/api/aura/score` are not CORS-open either; fetch them server-side if you need them.

## Common tasks

- **Run:** `cp .env.example .env && npm install && npm run dev` → localhost:5173
- **Build/typecheck:** `npm run build` (runs `tsc -b` then `vite build`)
- **Programme the dial:** edit `MARQUEE_PINS` in `src/lib/denpa.ts` — `{id, name,
  color}`, priority order, entries past `MARQUEE_SLOTS` are reserves promoted as
  leaders resolve. `fetchMarquee` keeps only pins passing `isAirable` (open AND
  endDate in the future — `status` alone is not enough, the hub reports "open"
  for markets whose end date passed months ago) and tops up
  from `/api/polymarket/markets` (open, ≥90d runway, biggest first, one per
  question family). Slot kinds: `"marquee"` (a market, indexed by `slot`),
  `"rank"` (operator board + field record), `"guide"` (channel clock + heatmap),
  `"wire"` (situations), `"tape"` (clip reel). Keys 0–9 map to `num`; T tunes
  TAPE; SPACE/P toggles `paused` (holds the pick via `heldRef` + pauses
  `TapePlayer`; `tune()` clears it).
- **Never sum a situation's deltas** — mutually exclusive buckets cancel to zero.
  Read `peakDelta`.
- **Reskin:** edit the `TT` palette in `src/App.tsx` — that's the entire look.

## Forking this into a NEW vertical

Ask the user only what you can't infer, then build:
1. Name + vertical? (sport / music / crypto / culture / film / news …)
2. Theme — reuse the Ceefax teletext skin, or custom colors + font?
3. Standalone repo, or an app in the denpa monorepo?

Then change `CHANNELS` + the `TT` theme. Don't touch the protocol layer.

Canonical guide + live snippets: https://denpa.ai/developer · https://denpa.ai/llms.txt
