# CLAUDE.md

See **[AGENTS.md](./AGENTS.md)** for how to work in this repo.

Quick reminder: data resolves through denpa.ai over plain REST (CORS, no auth,
**no `@denpa/sdk`**); the fork owns surface + theme only; always render
`<TvStatic/>` for loading/empty/error. Client + channels live in
`src/lib/denpa.ts`; the teletext surface + `TT` palette in `src/App.tsx`.
CH 1–6 are the marquee band — one long-running market per channel, pinned in
`MARQUEE_PINS` and resolved through `/api/network/market/:id`, charted over
`interval=ALL`. GUIDE = the channel clock (`/api/broadcast/program`); WIRE =
`/api/situations` (never sum deltas); RANK = `/api/network/operators` →
`/api/network/field-record/:handle`; TAPE = `/api/network/tapes` via
hls.js-first playback. Created by Lukas Chmiel and Robert Inoma.
