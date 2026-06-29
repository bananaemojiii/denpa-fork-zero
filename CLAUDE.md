# CLAUDE.md

See **[AGENTS.md](./AGENTS.md)** for how to work in this repo.

Quick reminder: data resolves through denpa.ai over plain REST (CORS, no auth,
**no `@denpa/sdk`**); the fork owns surface + theme only; always render
`<TvStatic/>` for loading/empty/error. Client + channels live in
`src/lib/denpa.ts`; the teletext surface + `TT` palette in `src/App.tsx`.
