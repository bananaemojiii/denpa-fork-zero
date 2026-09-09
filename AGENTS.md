# AGENTS.md — DENPA · FORK ZERO

Instructions for any AI (Claude Code, etc.) working in this repo. This is the
**reference fork** of the [Denpa protocol](https://denpa.ai): a static-TV
broadcast surface where every lane of the denpa.ai channel clock is a channel, plus WIRE
(situations), TAPE (federated clips) and RANK (network operator board).
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
  `fetchProgram` (channel clock) + `laneFor`, `fetchSchedule` (legacy fallback),
  `fetchHeatmap`, `fetchHistory`, `fetchSituations` + `marketRoute`, `fetchTapes`,
  `fetchNetworkOperators`, `fetchLeaderboard`, `CHANNELS`, `denpaLinks`, and the
  `ProgramLane` / `ProgramSegment` / `BroadcastSegment` / `HeatmapTile` /
  `PricePoint` / `Situation` / `Tape` / `NetOperator` / `OperatorRank` / `Channel` types.
- `src/App.tsx` — the broadcast surface: `TvStatic` (the static-TV placeholder),
  `Sparkline` (YES price chart), `NowPlaying`, `WireBoard`, `TapePlayer`
  (hls.js first, native HLS fallback), the zapper, and the `TT` teletext
  palette (the whole look lives here).
- `src/index.css` — base (black, blocky monospace).

## Endpoints (all CORS-open, no auth for reads)

```
GET denpa.ai/api/broadcast/program?preset=default           # the denpa.ai channel clock ({enabled:false} when unwired; hot · resolving · close too)
GET denpa.ai/api/broadcast/schedule?cat=sport               # legacy schedule (buckets + programs) — fallback
GET denpa.ai/api/polymarket/featured                        # home heatmap tiles
GET denpa.ai/api/polymarket/market-history?marketId=ID&interval=1H   # YES price history (legacy /history as fallback)
GET denpa.ai/api/situations?window=24h&limit=30             # stories of belief movement (never sum deltas)
GET denpa.ai/api/network/tapes?limit=20                     # federated clips (HLS manifests)
GET denpa.ai/api/network/operators                          # merged operator board
GET api-production-802f5.up.railway.app/api/v1/signals/leaderboard?operators=human
```

Configured via `.env` (`VITE_DENPA_API`, `VITE_DENPA_WEB`); see `.env.example`.
SIGNAL writes are `POST denpa.ai/api/predictions` with a `dk_` key through your
own server route (not CORS-open) — reads need nothing. `/api/wire` and
`/api/aura/score` are not CORS-open either; fetch them server-side if you need them.

## Common tasks

- **Run:** `cp .env.example .env && npm install && npm run dev` → localhost:5173
- **Build/typecheck:** `npm run build` (runs `tsc -b` then `vite build`)
- **Add a channel:** push to `CHANNELS` in `src/lib/denpa.ts` with a clock
  `lane` key (`sports` / `music` / `film` / `tv` / `fashion` / `crypto` — the
  lanes denpa.ai airs) and, only where the legacy route knows it, a schedule
  `cat` (`sport` / `music` / `crypto` / `politics` / `news` / `culture` /
  `science`; any other cat silently returns sport). Kind `"markets"` airs that
  lane (clock first, schedule fallback); `"rank"` is the operator board;
  `"guide"` is the heatmap; `"wire"`
  is situations; `"tape"` is the clip reel. Keys 0–9 map to `num`; T tunes TAPE; SPACE/P toggles `paused`
  (holds `nowSeg` via `heldSegRef` + pauses `TapePlayer`; `tune()` clears it).
- **Reskin:** edit the `TT` palette in `src/App.tsx` — that's the entire look.

## Forking this into a NEW vertical

Ask the user only what you can't infer, then build:
1. Name + vertical? (sport / music / crypto / culture / film / news …)
2. Theme — reuse the Ceefax teletext skin, or custom colors + font?
3. Standalone repo, or an app in the denpa monorepo?

Then change `CHANNELS` + the `TT` theme. Don't touch the protocol layer.

Canonical guide + live snippets: https://denpa.ai/developer · https://denpa.ai/llms.txt
