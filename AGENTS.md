# AGENTS.md — DENPA IPTV · FORK ZERO

Instructions for any AI (Claude Code, etc.) working in this repo. This is the
**reference fork** of the [Denpa protocol](https://denpa.ai): a Ceefax / IPTV
broadcast surface where every market category is a TV channel.

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
  `fetchLeaderboard`, `fetchHeatmap`, `fetchSchedule`, `fetchHistory`,
  `CHANNELS`, `denpaLinks`, and the `OperatorRank` / `HeatmapTile` /
  `BroadcastSegment` / `PricePoint` / `Channel` types.
- `src/App.tsx` — the IPTV surface: `TvStatic` (the static-TV placeholder),
  `Sparkline` (YES price chart), `NowPlaying`, the zapper, and the `TT`
  teletext palette (the whole look lives here).
- `src/index.css` — base (black, blocky monospace).

## Endpoints (all CORS-open, no auth for reads)

```
GET denpa.ai/api/polymarket/featured              # home heatmap tiles
GET denpa.ai/api/broadcast/schedule?cat=sport     # schedule (buckets + programs)
GET denpa.ai/api/polymarket/history?market_id=ID  # YES price history (chart points)
GET api-production-802f5.up.railway.app/api/v1/signals/leaderboard?operators=human
```

Configured via `.env` (`VITE_DENPA_API`, `VITE_DENPA_WEB`); see `.env.example`.
SIGNAL writes go through the API service (API-key gated) — reads need nothing.

## Common tasks

- **Run:** `cp .env.example .env && npm install && npm run dev` → localhost:5173
- **Build/typecheck:** `npm run build` (runs `tsc -b` then `vite build`)
- **Add a channel:** push to `CHANNELS` in `src/lib/denpa.ts` with a schedule
  `cat` (`sport` / `crypto` / `politics` / `culture` / `music` / `news` /
  `science`). Kind `"markets"` airs that category; `"rank"` is the leaderboard;
  `"guide"` is the heatmap.
- **Reskin:** edit the `TT` palette in `src/App.tsx` — that's the entire look.

## Forking this into a NEW vertical

Ask the user only what you can't infer, then build:
1. Name + vertical? (sport / music / crypto / culture / film / news …)
2. Theme — reuse the Ceefax teletext skin, or custom colors + font?
3. Standalone repo, or an app in the denpa monorepo?

Then change `CHANNELS` + the `TT` theme. Don't touch the protocol layer.

Canonical guide + live snippets: https://denpa.ai/developer · https://denpa.ai/llms.txt
