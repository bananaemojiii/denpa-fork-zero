import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import {
  fetchHeatmap,
  fetchHistory,
  fetchMarquee,
  fetchProgram,
  fetchSituations,
  fetchTapes,
  fetchNetworkOperators,
  marketRoute,
  denpaLinks,
  CHANNELS,
  type MarqueeMarket,
  type HeatmapTile,
  type ProgramLane,
  type ProgramSegment,
  type PricePoint,
  type Situation,
  type Tape,
  type NetOperator,
  fetchFieldRecord,
  type FieldRecord,
} from "./lib/denpa";

// Retro broadcast palette — the static-TV skin IS the surface.
const TT = {
  bg: "#000000",
  white: "#ffffff",
  cyan: "#00ffff",
  yellow: "#ffff00",
  green: "#00ff00",
  red: "#ff0000",
  blue: "#0000ff",
  magenta: "#ff00ff",
  grey: "#a0a0a0",
} as const;

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fmtClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDate(d: Date): string {
  return `${DOW[d.getDay()]} ${pad(d.getDate())} ${MON[d.getMonth()]}`;
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--:--" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// "RESOLVES IN 02:14:09" style countdown from a millisecond remainder.
function fmtCountdown(ms: number): string {
  if (ms <= 0) return "RESOLVING";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}D ${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// "09 SEP" — a date on the timeline axis.
function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())} ${MON[d.getMonth()]}`;
}

// "71D LEFT" — runway to resolution, the unit a marquee channel is measured in.
function fmtDays(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "RESOLVING";
  const d = Math.floor(ms / 86_400_000);
  return d >= 1 ? `${d}D LEFT` : `${Math.floor(ms / 3_600_000)}H LEFT`;
}

/* ───────────── Dead-channel TV static ───────────── */
function TvStatic({ caption }: { caption: string }) {
  const noise =
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(0,0,0,0.10) 1px, rgba(255,255,255,0.04) 2px, rgba(0,0,0,0.08) 3px)";
  return (
    <div
      style={{
        position: "relative",
        height: 300,
        background: "#0a0a0a",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{`
        @keyframes fz-static { 0%{transform:translateY(0)} 50%{transform:translateY(-2px)} 100%{transform:translateY(0)} }
        @keyframes fz-flicker { 0%,100%{opacity:.5} 7%{opacity:.85} 9%{opacity:.35} 51%{opacity:.7} 53%{opacity:.4} }
        @keyframes fz-roll { 0%{background-position:0 0} 100%{background-position:0 6px} }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: "-10%",
          backgroundImage: noise,
          backgroundSize: "100% 4px",
          opacity: 0.5,
          animation: "fz-flicker 2.4s steps(2) infinite, fz-static 0.3s steps(3) infinite",
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(#33333322 50%, transparent 50%)",
          backgroundSize: "100% 6px",
          animation: "fz-roll 8s linear infinite",
          opacity: 0.4,
        }}
      />
      <div style={{ position: "relative", textAlign: "center", padding: "0 1rem" }}>
        <div
          style={{
            color: TT.white,
            fontWeight: 900,
            letterSpacing: "0.3em",
            fontSize: "1.3rem",
            textTransform: "uppercase",
          }}
        >
          NO SIGNAL
        </div>
        <div style={{ marginTop: "0.6rem", color: TT.grey, fontSize: "0.7rem", letterSpacing: "0.14em" }}>{caption}</div>
      </div>
    </div>
  );
}

/* ───────────── Live price chart (SVG sparkline of YES history) ───────────── */
function Sparkline({ points, color, fit = false, height = 56 }: { points: PricePoint[]; color: string; fit?: boolean; height?: number }) {
  const W = 100;
  const H = 30;
  // fit: scale the y-axis to the band the market actually traded in (plus 12% headroom),
  // so a question that lives between 5% and 12% still draws a readable arc.
  const scale = useMemo(() => {
    if (points.length < 2) return null;
    const ps = points.map((p) => p.p);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    if (!fit) return { lo: 0, hi: 100 };
    const padding = Math.max((hi - lo) * 0.12, 0.5);
    return { lo: Math.max(0, lo - padding), hi: Math.min(100, hi + padding) };
  }, [points, fit]);

  const path = useMemo(() => {
    if (!scale || points.length < 2) return "";
    const xs = points.map((p) => p.ts);
    const minX = Math.min(...xs);
    const spanX = (Math.max(...xs) - minX) || 1;
    const spanY = (scale.hi - scale.lo) || 1;
    return points
      .map((p, i) => {
        const x = ((p.ts - minX) / spanX) * W;
        const y = H - ((Math.max(scale.lo, Math.min(scale.hi, p.p)) - scale.lo) / spanY) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, scale]);

  if (!path || !scale) {
    return <div style={{ color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.1em" }}>CHART · NO HISTORY</div>;
  }
  // Guide line at 50% when it is on screen, else through the middle of the fitted band.
  const midY = scale.lo <= 50 && 50 <= scale.hi ? H - ((50 - scale.lo) / (scale.hi - scale.lo)) * H : H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <line x1="0" y1={midY} x2={W} y2={midY} stroke="#222" strokeWidth="0.5" />
      <polyline points={path.replace(/[ML]/g, " ").trim()} fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ───────────── Section header (page tab) ───────────── */
function SectionHead({ page, title, color }: { page: string; title: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.8rem",
        alignItems: "baseline",
        margin: "1.1rem 0 0.45rem",
        borderBottom: `1px solid ${TT.blue}`,
        paddingBottom: "0.35rem",
      }}
    >
      <span style={{ color: TT.grey, fontSize: "0.72rem" }}>{page}</span>
      <span style={{ color, fontWeight: 900, letterSpacing: "0.14em", fontSize: "1rem" }}>{title}</span>
    </div>
  );
}

const row: React.CSSProperties = { display: "flex", gap: "0.7rem", alignItems: "baseline", padding: "0.2rem 0" };
const cell: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/* ───────────── The marquee screen — one long-running market, aired as a channel ─────────────
   The programme is the arc: the whole price history, the range it has travelled, and how
   long it still has to run. Not a 60-minute wiggle. */
function MarqueeScreen({ market, history, remainMs }: { market: MarqueeMarket; history: PricePoint[]; remainMs: number }) {
  const yes = Math.round((market.yesPrice ?? 0) * 100);
  const no = Math.round((market.noPrice ?? 1 - (market.yesPrice ?? 0)) * 100);
  // The arc: where it opened in the window, where it has been, where it is now.
  const arc = useMemo(() => {
    if (history.length < 2) return null;
    const ps = history.map((h) => h.p);
    return {
      open: history[0].p,
      last: history[history.length - 1].p,
      lo: Math.min(...ps),
      hi: Math.max(...ps),
      from: history[0].ts,
      to: history[history.length - 1].ts,
    };
  }, [history]);
  const change = arc ? arc.last - arc.open : null;

  return (
    <div style={{ background: "#070707", padding: "1rem 1.1rem 1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.3rem" }}>
        <span style={{ color: TT.red, fontWeight: 900, letterSpacing: "0.14em", animation: "fz-blink 1s steps(1) infinite" }}>
          ● ON AIR
        </span>
        <span style={{ color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.12em" }}>
          RESOLVES IN {fmtCountdown(remainMs)}
        </span>
      </div>

      <a
        href={denpaLinks.market(`/m/${market.id}`)}
        target="_blank"
        rel="noreferrer"
        style={{ color: TT.white, fontWeight: 900, fontSize: "1.15rem", lineHeight: 1.25, display: "block", margin: "0.55rem 0 0.75rem", textDecoration: "none" }}
      >
        {market.title}
      </a>

      {/* YES / NO split bars — green YES, cyan NO */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: TT.green, fontSize: "0.66rem", letterSpacing: "0.1em", fontWeight: 900 }}>
            <span>YES</span>
            <span>{yes}%</span>
          </div>
          <div style={{ height: 8, background: "#111", marginTop: 3 }}>
            <div style={{ height: "100%", width: `${yes}%`, background: TT.green }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: TT.cyan, fontSize: "0.66rem", letterSpacing: "0.1em", fontWeight: 900 }}>
            <span>NO</span>
            <span>{no}%</span>
          </div>
          <div style={{ height: 8, background: "#111", marginTop: 3 }}>
            <div style={{ height: "100%", width: `${no}%`, background: TT.cyan }} />
          </div>
        </div>
      </div>

      {/* The arc — the market's whole recorded history */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.1em" }}>
        <span>TIMELINE · YES{arc ? ` · ${fmtDay(arc.from)} → ${fmtDay(arc.to)}` : ""}</span>
        {change !== null && (
          <span style={{ color: change >= 0 ? TT.green : TT.red, fontWeight: 900 }}>
            {change >= 0 ? "▲" : "▼"} {change >= 0 ? "+" : ""}{change.toFixed(1)} PTS
          </span>
        )}
      </div>
      <Sparkline points={history} color={market.color} fit height={110} />

      {arc && (
        <div style={{ display: "flex", justifyContent: "space-between", color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.08em", marginTop: "0.3rem" }}>
          <span style={{ color: "#555" }}>SCALED TO RANGE</span>
          <span>OPEN {arc.open.toFixed(1)}%</span>
          <span>LOW {arc.lo.toFixed(1)}%</span>
          <span>HIGH {arc.hi.toFixed(1)}%</span>
          <span style={{ color: TT.white, fontWeight: 900 }}>NOW {arc.last.toFixed(1)}%</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", color: TT.grey, fontSize: "0.64rem", letterSpacing: "0.08em", marginTop: "0.5rem", flexWrap: "wrap", gap: "0.3rem" }}>
        <span>VOL ${Math.round((market.volume ?? 0) / 1000)}K</span>
        <span>{market.provider.toUpperCase()}</span>
        <span>{fmtDays(market.endDate)}</span>
      </div>

      {/* SIGNAL actions — resolve to the denpa.ai market page (money-free forecast) */}
      <div style={{ display: "flex", gap: 0, marginTop: "0.8rem" }}>
        <a
          href={denpaLinks.market(`/m/${market.id}`)}
          target="_blank"
          rel="noreferrer"
          style={{ flex: 1, textAlign: "center", background: TT.green, color: "#000", fontWeight: 900, fontSize: "0.78rem", letterSpacing: "0.12em", padding: "0.55rem 0", textDecoration: "none" }}
        >
          ▸ SIGNAL YES
        </a>
        <a
          href={denpaLinks.market(`/m/${market.id}`)}
          target="_blank"
          rel="noreferrer"
          style={{ flex: 1, textAlign: "center", background: TT.cyan, color: "#000", fontWeight: 900, fontSize: "0.78rem", letterSpacing: "0.12em", padding: "0.55rem 0", textDecoration: "none" }}
        >
          ▸ SIGNAL NO
        </a>
      </div>
    </div>
  );
}

/* ───────────── WIRE — what moved (situations) ───────────── */
function WireBoard({ items }: { items: Situation[] }) {
  if (items.length === 0) return <TvStatic caption="WIRE OFFLINE — NO SITUATIONS IN WINDOW" />;
  const critColor = (c: string) => (c === "Critical" ? TT.red : c === "Elevated" ? TT.yellow : TT.grey);
  return (
    <>
      <div style={{ ...row, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em" }}>
        <span style={{ width: "5.2rem", flexShrink: 0 }}>LANE</span>
        <span style={{ flex: 1 }}>SITUATION · 24H</span>
        <span style={{ width: "4.6rem", textAlign: "right", flexShrink: 0 }}>MOVE</span>
        <span style={{ width: "4.4rem", textAlign: "right", flexShrink: 0 }}>VOL</span>
      </div>
      {items.map((s) => {
        const pts = Math.round(s.peakDelta * 100);
        return (
          <a key={s.id} href={denpaLinks.market(marketRoute(s.leadMarketId))} target="_blank" rel="noreferrer" style={{ ...row, textDecoration: "none" }} title={`${s.criticality} · ${s.marketCount} market(s) · ${s.provider}`}>
            <span style={{ width: "5.2rem", flexShrink: 0, fontSize: "0.64rem", letterSpacing: "0.08em", color: critColor(s.criticality) }}>
              {s.criticality === "Critical" ? "▮ " : ""}{s.lane}
            </span>
            <span style={{ ...cell, color: TT.white, flex: 1 }}>{s.headline}</span>
            <span style={{ width: "4.6rem", textAlign: "right", flexShrink: 0, fontWeight: 900, color: pts >= 0 ? TT.green : TT.cyan }}>
              {pts >= 0 ? "▲" : "▼"} {Math.abs(pts)}
            </span>
            <span style={{ width: "4.4rem", textAlign: "right", flexShrink: 0, color: TT.grey, fontSize: "0.66rem" }}>${Math.round(s.volume / 1000)}K</span>
          </a>
        );
      })}
    </>
  );
}

/* ───────────── TAPE — the federated clip reel, played as a channel ─────────────
   hls.js first (Chrome 152+ native HLS renders black on some CDNs), native <video> as the fallback. */
function TapePlayer({ tapes, paused }: { tapes: Tape[]; paused: boolean }) {
  const [i, setI] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Play/pause from the set: a paused clip never ends, so the reel stays put.
  // The onPlay guard also catches autoplay on a clip that attaches while paused.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else void v.play().catch(() => {});
  }, [paused]);
  const tape = tapes[i];
  const next = useCallback(() => setI((x) => (tapes.length ? (x + 1) % tapes.length : 0)), [tapes.length]);
  const prev = useCallback(() => setI((x) => (tapes.length ? (x - 1 + tapes.length) % tapes.length : 0)), [tapes.length]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !tape) return;
    let hls: Hls | null = null;
    let live = true;
    // hls.js is loaded on first use so the broadcast set's first paint stays small.
    void import("hls.js").then(({ default: HlsCtor }) => {
      if (!live) return;
      if (HlsCtor.isSupported()) {
        hls = new HlsCtor({ enableWorker: true });
        hls.loadSource(tape.url);
        hls.attachMedia(v);
      } else {
        v.src = tape.url; // Safari: native HLS
      }
      void v.play().catch(() => {});
    });
    return () => {
      live = false;
      hls?.destroy();
      v.removeAttribute("src");
    };
  }, [tape]);
  if (!tape) return <TvStatic caption="TAPE OFFLINE — NO CLIPS ON THE NETWORK" />;
  const stanceColor = tape.stance === "YES" ? TT.green : tape.stance === "NO" ? TT.cyan : TT.grey;
  return (
    <div style={{ background: "#070707" }}>
      <div style={{ position: "relative", background: "#000", aspectRatio: "16 / 9", maxHeight: 420 }}>
        <video ref={videoRef} muted autoPlay playsInline onEnded={next} onPlay={() => { if (pausedRef.current) videoRef.current?.pause(); }} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        <div style={{ position: "absolute", left: 10, top: 8, color: TT.red, fontWeight: 900, letterSpacing: "0.14em", fontSize: "0.72rem", animation: "fz-blink 1s steps(1) infinite" }}>● TAPE</div>
        <div style={{ position: "absolute", right: 10, top: 8, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em" }}>{i + 1} / {tapes.length}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.6rem 0.9rem 0.2rem", gap: "0.6rem", flexWrap: "wrap" }}>
        <a href={tape.href} target="_blank" rel="noreferrer" style={{ color: TT.white, fontWeight: 900, textDecoration: "none" }}>
          @{tape.handle} <span style={{ color: TT.grey, fontWeight: 400, fontSize: "0.66rem", letterSpacing: "0.1em" }}>· {tape.origin.toUpperCase()}</span>
        </a>
        <span style={{ color: stanceColor, fontWeight: 900, letterSpacing: "0.12em", fontSize: "0.72rem" }}>SIGNAL {tape.stance}</span>
        <span style={{ color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.08em" }}>{tape.durationS}S · {tape.views} VIEWS{tape.boosted ? " · BOOSTED" : ""}</span>
      </div>
      <div style={{ display: "flex", gap: 0, padding: "0.5rem 0.9rem 0.9rem" }}>
        <button onClick={prev} style={{ background: "transparent", color: TT.white, border: "1px solid #333", fontFamily: "inherit", fontWeight: 900, padding: "0.4rem 0.7rem", cursor: "pointer" }}>◂ PREV</button>
        <a href={denpaLinks.market(`/m/${tape.marketId}`)} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: TT.magenta, color: "#000", fontWeight: 900, fontSize: "0.72rem", letterSpacing: "0.12em", padding: "0.5rem 0", textDecoration: "none" }}>
          ▸ OPEN MARKET
        </a>
        <button onClick={next} style={{ background: "transparent", color: TT.white, border: "1px solid #333", fontFamily: "inherit", fontWeight: 900, padding: "0.4rem 0.7rem", cursor: "pointer" }}>NEXT ▸</button>
      </div>
    </div>
  );
}

// FIELD RECORD — an operator's public judgment history, pulled from the hub when a
// RANK row is selected. Loading / missing both render dead air, never a spinner.
function FieldRecordView({ op, record, onBack }: { op: NetOperator; record: FieldRecord | null | undefined; onBack: () => void }) {
  const name = (op.displayName || op.handle).toUpperCase();
  const station = op.origin.toUpperCase();
  const stat = (label: string, value: string | number, color: string = TT.white) => (
    <div key={label} style={{ display: "flex", flexDirection: "column", minWidth: "5.4rem" }}>
      <span style={{ color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ color, fontWeight: 900, fontSize: "1rem" }}>{value}</span>
    </div>
  );
  const clv = record?.avgClvBps ?? null;
  return (
    <>
      <SectionHead page="P108.1" title={`FIELD RECORD — ${name} · ${station}`} color={TT.green} />
      <div style={{ display: "flex", gap: "0.9rem", alignItems: "baseline", marginBottom: "0.6rem", flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          style={{ cursor: "pointer", border: `1px solid ${TT.green}`, background: "transparent", color: TT.green, fontFamily: "inherit", fontWeight: 900, fontSize: "0.68rem", letterSpacing: "0.08em", padding: "0.25rem 0.55rem" }}
        >
          ◂ BACK
        </button>
        <a href={record?.profileUrl || op.href} target="_blank" rel="noreferrer" style={{ color: TT.cyan, fontSize: "0.68rem", letterSpacing: "0.08em" }}>
          OPEN ON {station} ▸
        </a>
        <span style={{ color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.08em" }}>ESC RETURNS TO THE BOARD</span>
      </div>
      {record === undefined ? (
        <TvStatic caption="PULLING FIELD RECORD FROM THE HUB…" />
      ) : record === null ? (
        <TvStatic caption={`NO FIELD RECORD ON THE HUB FOR ${name} — OPEN ON ${station}`} />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem 1.4rem", padding: "0.5rem 0", borderTop: "1px solid #222", borderBottom: "1px solid #222" }}>
            {stat("RANK", record.rank ? `#${record.rank} / ${record.operators}` : "—", TT.cyan)}
            {stat("SCORE", record.score, TT.yellow)}
            {stat("ACC", `${record.accuracy}%`, TT.green)}
            {stat("CALLS", record.calls)}
            {stat("W–L", `${record.correct}–${Math.max(0, record.resolved - record.correct)}`)}
            {stat("OPEN", record.pending)}
            {stat("STREAK", record.streak, record.streak > 0 ? TT.green : TT.white)}
            {stat("AVG CLV", clv == null ? "—" : `${clv > 0 ? "+" : ""}${(clv / 100).toFixed(1)}PT`, clv == null ? TT.white : clv > 0 ? TT.green : clv < 0 ? TT.red : TT.white)}
          </div>
          <div style={{ ...row, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em", marginTop: "0.6rem" }}>
            <span style={{ width: "2.6rem", flexShrink: 0 }}>CALL</span>
            <span style={{ flex: 1 }}>MARKET</span>
            <span style={{ width: "4.5rem", textAlign: "right", flexShrink: 0 }}>STATUS</span>
            <span style={{ width: "5rem", textAlign: "right", flexShrink: 0 }}>RECEIPT</span>
          </div>
          {record.recent.length === 0 ? (
            <div style={{ color: TT.grey, fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0" }}>NO CALLS FILED YET</div>
          ) : (
            record.recent.map((c) => {
              const sc = c.status === "won" ? TT.green : c.status === "lost" ? TT.red : TT.grey;
              return (
                <div key={`${c.marketId}:${c.createdAt}`} style={row}>
                  <span style={{ width: "2.6rem", flexShrink: 0, fontWeight: 900, color: c.direction === "YES" ? TT.green : TT.cyan }}>{c.direction}</span>
                  <a href={denpaLinks.market(`/m/${c.marketId}`)} target="_blank" rel="noreferrer" style={{ ...cell, flex: 1, color: TT.white, textDecoration: "none" }}>
                    {c.marketTitle || c.marketId}
                  </a>
                  <span style={{ width: "4.5rem", textAlign: "right", flexShrink: 0, color: sc, fontWeight: 900, fontSize: "0.72rem" }}>{c.status.toUpperCase()}</span>
                  <span style={{ width: "5rem", textAlign: "right", flexShrink: 0, fontSize: "0.68rem" }}>
                    {c.receiptUrl ? (
                      <a href={c.receiptUrl} target="_blank" rel="noreferrer" style={{ color: TT.yellow }}>◼ RECEIPT</a>
                    ) : (
                      <span style={{ color: TT.grey }}>—</span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </>
      )}
    </>
  );
}

export default function App() {
  const [now, setNow] = useState(new Date());
  const [chIdx, setChIdx] = useState(0);
  // PAUSE holds the now-playing segment and the tape; the clock keeps ticking.
  const [paused, setPaused] = useState(false);
  const channel = CHANNELS[chIdx];

  // The marquee band (CH 1–6) + global feeds.
  const [marquee, setMarquee] = useState<MarqueeMarket[]>([]);
  const [netOps, setNetOps] = useState<NetOperator[]>([]);
  // RANK: the selected operator + their hub field record (undefined = pulling, null = none).
  const [recOp, setRecOp] = useState<NetOperator | null>(null);
  const [record, setRecord] = useState<FieldRecord | null | undefined>(undefined);
  const [tiles, setTiles] = useState<HeatmapTile[]>([]);
  const [program, setProgram] = useState<ProgramLane[] | null>(null);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState(0);
  const histFor = useRef<string | null>(null);

  // Clock tick.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Tune by channel number / arrow keys — the zapper.
  const tune = useCallback((idx: number) => {
    const n = ((idx % CHANNELS.length) + CHANNELS.length) % CHANNELS.length;
    setChIdx(n);
    setPaused(false); // zapping resumes
    setRecOp(null); // back to the board
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        const found = CHANNELS.findIndex((c) => c.num === Number(e.key));
        if (found >= 0) tune(found);
      } else if (e.key === "t" || e.key === "T") {
        const found = CHANNELS.findIndex((c) => c.kind === "tape");
        if (found >= 0) tune(found);
      } else if (e.key === " " || e.key === "p" || e.key === "P") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "Escape") setRecOp(null);
      else if (e.key === "ArrowUp") tune(chIdx - 1);
      else if (e.key === "ArrowDown") tune(chIdx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chIdx, tune]);

  // Global feeds — initial + 30s refresh. Every one of these is a denpa.ai hub
  // endpoint sending Access-Control-Allow-Origin: *, so they read from any host
  // the fork is deployed on. (The api-production leaderboard is NOT: its CORS
  // allowlist is localhost + *.up.railway.app, so a browser fork on any other
  // domain gets a blocked request. RANK reads /api/network/operators instead,
  // which is the merged board across every station anyway.)
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [hm, pg, st, tp, op] = await Promise.allSettled([
        fetchHeatmap(),
        fetchProgram("default"),
        fetchSituations(30, "24h"),
        fetchTapes(20),
        fetchNetworkOperators(),
      ]);
      if (!live) return;
      let errs = 0;
      if (hm.status === "fulfilled") setTiles(hm.value);
      else errs++;
      if (pg.status === "fulfilled") setProgram(pg.value);
      else errs++;
      if (st.status === "fulfilled") setSituations(st.value);
      else errs++;
      if (tp.status === "fulfilled") setTapes(tp.value);
      else errs++;
      if (op.status === "fulfilled") setNetOps(op.value);
      else errs++;
      setErrors(errs);
      setLoaded(true);
    };
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  // The marquee band — the long-running markets on CH 1–6. Pins that have resolved
  // drop off and the band tops itself up, so the dial stays live without a redeploy.
  useEffect(() => {
    let live = true;
    const load = async () => {
      const band = await fetchMarquee();
      if (live && band.length) setMarquee(band);
    };
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  // Field record for the selected RANK operator — hub service; station page is the fallback.
  useEffect(() => {
    if (!recOp) return;
    let live = true;
    setRecord(undefined);
    void fetchFieldRecord(recOp.handle).then((r) => {
      if (live) setRecord(r);
    });
    return () => {
      live = false;
    };
  }, [recOp]);

  // The market on the tuned slot. Paused holds the pick (same rule as the rest of the
  // protocol — hold the pick, never stop the clock), so PLAY re-syncs to the band.
  const heldRef = useRef<MarqueeMarket | null>(null);
  const slotMarket: MarqueeMarket | null = useMemo(() => {
    if (channel.kind !== "marquee") return null;
    if (paused && heldRef.current) return heldRef.current;
    return marquee[channel.slot ?? 0] ?? null;
  }, [channel, marquee, paused]);
  if (channel.kind === "marquee") heldRef.current = slotMarket;

  // The channel clock, flattened — what the protocol airs next across every lane. CH 8.
  const clockNext = useMemo<ProgramSegment[]>(() => {
    const t = now.getTime();
    return (program ?? [])
      .flatMap((l) => l.segs.map((sg) => ({ ...sg, category: sg.category || l.label })))
      .filter((sg) => sg.kind === "content" && new Date(sg.endDate).getTime() > t)
      .sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime())
      .filter((sg, i, arr) => arr.findIndex((o) => o.id === sg.id) === i)
      .slice(0, 14);
  }, [program, now]);

  // Price history follows the tuned market — interval ALL, because a marquee
  // question has months of runway: the arc is the programme, not a 60-minute wiggle.
  useEffect(() => {
    if (!slotMarket) {
      setHistory([]);
      histFor.current = null;
      return;
    }
    if (histFor.current === slotMarket.id) return;
    histFor.current = slotMarket.id;
    let live = true;
    void fetchHistory(slotMarket.id, "ALL").then((pts) => {
      if (live) setHistory(pts);
    });
    return () => {
      live = false;
    };
  }, [slotMarket]);

  // Time left until the tuned market resolves.
  const remainMs = slotMarket?.endDate ? new Date(slotMarket.endDate).getTime() - now.getTime() : 0;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: TT.bg }}>
      <style>{`@keyframes fz-blink{0%,49%{opacity:1}50%,100%{opacity:0.3}} @keyframes fz-marq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
      {/* CRT scanline overlay — the "static TV" texture. */}
      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "fixed",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 50%, transparent 50%)",
          backgroundSize: "100% 3px",
          zIndex: 50,
        }}
      />
      <main
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "1.4rem 1rem 3rem",
          fontFamily: '"Cascadia Mono","DejaVu Sans Mono","Courier New",monospace',
          lineHeight: 1.5,
        }}
      >
        <div style={{ background: TT.bg, border: "2px solid #222", padding: "1.1rem 1.25rem 1.25rem" }}>
          {/* Header line: page no · masthead · date+clock */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.85rem", letterSpacing: "0.08em" }}>
            <span style={{ color: TT.white }}>P{100 + channel.num}</span>
            <span style={{ color: TT.cyan, fontWeight: 900, letterSpacing: "0.2em" }}>DENPA · SIGNAL</span>
            <span style={{ color: TT.green }}>
              <button
                onClick={() => setPaused((p) => !p)}
                title={paused ? "resume (SPACE)" : "pause (SPACE)"}
                style={{ background: "transparent", color: paused ? TT.yellow : TT.white, border: "1px solid #333", fontFamily: "inherit", fontSize: "0.7rem", fontWeight: 900, letterSpacing: "0.1em", padding: "0.15rem 0.5rem", marginRight: "0.8rem", cursor: "pointer" }}
              >
                {paused ? "▶ PLAY" : "❚❚ PAUSE"}
              </button>
              {fmtDate(now)} {fmtClock(now)}
            </span>
          </div>

          {/* Masthead + tuned-channel readout */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.2rem 0.8rem", margin: "0.7rem 0 0.15rem" }}>
            <div style={{ color: TT.yellow, fontWeight: 900, fontSize: "2rem", letterSpacing: "0.04em" }}>DENPA</div>
            <div style={{ color: slotMarket?.color ?? channel.color, fontWeight: 900, fontSize: "1.1rem", letterSpacing: "0.12em" }}>
              CH {pad(channel.num)} ▸ {slotMarket?.name ?? channel.name}
            </div>
          </div>
          <div style={{ color: TT.grey, fontSize: "0.7rem", letterSpacing: "0.18em", borderBottom: `2px solid ${TT.magenta}`, paddingBottom: "0.6rem" }}>
            THE NEW MEDIA PRIMITIVE — EVERY MARKET A LIVE SIGNAL · FORK ZERO · denpa.ai{program ? "  ·  CHANNEL CLOCK LIVE" : ""}{paused ? "  ·  PAUSED" : ""}{errors > 0 ? `  ·  ${errors} FEED(S) OFFLINE` : ""}
          </div>

          {/* ───── THE SCREEN ───── */}
          {!loaded ? (
            <div style={{ marginTop: "1rem" }}>
              <TvStatic caption="TUNING — RESOLVING DENPA SIGNAL…" />
            </div>
          ) : channel.kind === "marquee" ? (
            marquee.length === 0 ? (
              <div style={{ marginTop: "1rem" }}>
                <TvStatic caption="TUNING THE MARQUEE BAND…" />
              </div>
            ) : slotMarket ? (
              <div style={{ marginTop: "1rem" }}>
                <MarqueeScreen market={slotMarket} history={history} remainMs={remainMs} />
                <SectionHead page={`P${100 + channel.num}.D`} title="ALSO ON THE DIAL" color={slotMarket.color} />
                {marquee
                  .filter((m) => m.id !== slotMarket.id)
                  .map((m) => {
                    const idx = CHANNELS.findIndex((c) => c.kind === "marquee" && marquee[c.slot ?? -1]?.id === m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => idx >= 0 && tune(idx)}
                        style={{ ...row, width: "100%", background: "transparent", border: "none", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", textAlign: "left", padding: "0.2rem 0" }}
                      >
                        <span style={{ color: m.color, width: "8.2rem", flexShrink: 0, fontWeight: 900, fontSize: "0.68rem", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                          {idx >= 0 ? `CH ${pad(CHANNELS[idx].num)}` : "—"} {m.name}
                        </span>
                        <span style={{ ...cell, color: TT.white, flex: 1 }}>{m.title}</span>
                        <span style={{ color: TT.grey, width: "4.2rem", textAlign: "right", flexShrink: 0, fontSize: "0.66rem" }}>{fmtDays(m.endDate)}</span>
                        <span style={{ color: TT.yellow, width: "3rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>{Math.round((m.yesPrice ?? 0) * 100)}%</span>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <div style={{ marginTop: "1rem" }}>
                <TvStatic caption={`CH ${pad(channel.num)} OFF AIR — NO MARKET ON THIS SLOT`} />
              </div>
            )
          ) : channel.kind === "rank" ? (
            recOp ? (
              <FieldRecordView op={recOp} record={record} onBack={() => setRecOp(null)} />
            ) : (
            <>
              <SectionHead page="P107" title={netOps.length ? "NETWORK OPERATOR BOARD" : "SIGNAL LEADERBOARD"} color={TT.green} />
              {netOps.length > 0 ? (
                <>
                  <div style={{ ...row, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em" }}>
                    <span style={{ width: "2rem", flexShrink: 0 }}>#</span>
                    <span style={{ flex: 1 }}>OPERATOR · STATION</span>
                    <span style={{ width: "4.5rem", textAlign: "right", flexShrink: 0 }}>W–L</span>
                    <span style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>SCORE</span>
                    <span style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>ACC</span>
                  </div>
                  {netOps.map((o, idx) => (
                    <a
                      key={`${o.origin}:${o.handle}`}
                      href={o.href}
                      target="_blank"
                      rel="noreferrer"
                      title="field record"
                      onClick={(e) => { e.preventDefault(); setRecOp(o); }}
                      style={{ ...row, textDecoration: "none", cursor: "pointer" }}
                    >
                      <span style={{ color: TT.cyan, width: "2rem", flexShrink: 0 }}>{idx + 1}</span>
                      <span style={{ ...cell, color: TT.white, flex: 1 }}>
                        {o.displayName || o.handle}
                        <span style={{ color: TT.grey, fontSize: "0.62rem" }}> · {o.origin.toUpperCase()}{o.pending > 0 ? ` · ${o.pending} OPEN` : ""}</span>
                      </span>
                      <span style={{ width: "4.5rem", textAlign: "right", flexShrink: 0, fontSize: "0.72rem" }}>
                        <span style={{ color: TT.green }}>{o.won}</span>
                        <span style={{ color: TT.grey }}>–</span>
                        <span style={{ color: TT.red }}>{o.lost}</span>
                      </span>
                      <span style={{ color: TT.yellow, width: "4rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>{o.score}</span>
                      <span style={{ color: TT.green, width: "4rem", textAlign: "right", flexShrink: 0 }}>{o.accuracy}%</span>
                    </a>
                  ))}
                </>
              ) : (
                <TvStatic caption="OPERATOR BOARD OFFLINE" />
              )}
            </>
            )
          ) : channel.kind === "wire" ? (
            <>
              <SectionHead page="P100" title="WIRE — WHAT MOVED" color={TT.red} />
              <WireBoard items={situations} />
            </>
          ) : channel.kind === "tape" ? (
            <div style={{ marginTop: "1rem" }}>
              <TapePlayer tapes={tapes} paused={paused} />
            </div>
          ) : (
            <>
              <SectionHead page="P108" title={clockNext.length ? "GUIDE — THE CHANNEL CLOCK" : "GUIDE — TOP MARKETS"} color={TT.cyan} />
              {clockNext.length > 0 && (
                <>
                  <div style={{ ...row, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em" }}>
                    <span style={{ width: "3.4rem", flexShrink: 0 }}>STARTS</span>
                    <span style={{ flex: 1 }}>SEGMENT</span>
                    <span style={{ width: "5rem", flexShrink: 0 }}>LANE</span>
                    <span style={{ width: "3rem", textAlign: "right", flexShrink: 0 }}>YES</span>
                  </div>
                  {clockNext.map((sg) => (
                    <a key={sg.segmentId} href={denpaLinks.market(`/m/${sg.id}`)} target="_blank" rel="noreferrer" style={{ ...row, textDecoration: "none" }}>
                      <span style={{ color: TT.cyan, width: "3.4rem", flexShrink: 0 }}>{hhmm(sg.startsAt)}</span>
                      <span style={{ ...cell, color: TT.white, flex: 1 }}>{sg.title}</span>
                      <span style={{ color: TT.grey, width: "5rem", flexShrink: 0, fontSize: "0.64rem", ...cell }}>{(sg.category || "").toUpperCase()}</span>
                      <span style={{ color: TT.yellow, width: "3rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>{Math.round(sg.yesPrice)}%</span>
                    </a>
                  ))}
                  <SectionHead page="P109" title="TOP MARKETS" color={TT.cyan} />
                </>
              )}
              {tiles.length === 0 ? (
                clockNext.length === 0 ? <TvStatic caption="GUIDE OFFLINE" /> : null
              ) : (
                tiles.map((t) => (
                  <a key={t.id} href={denpaLinks.market(t.route)} target="_blank" rel="noreferrer" style={{ ...row, textDecoration: "none" }}>
                    <span style={{ ...cell, color: TT.white, flex: 1 }}>{t.topMarket || t.label}</span>
                    <span style={{ color: TT.grey, width: "6rem", flexShrink: 0, fontSize: "0.68rem", textAlign: "right" }}>${Math.round(t.totalVol24h / 1000)}K</span>
                    <span style={{ color: TT.yellow, width: "3.4rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>{Math.round(t.topYesPct)}%</span>
                  </a>
                ))
              )}
            </>
          )}

          {/* ───── CHANNEL ZAPPER ───── */}
          <SectionHead page="ZAP" title="CHANNELS — ▲▼ · 0–9 · T" color={TT.white} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {CHANNELS.map((c, i) => {
              const on = i === chIdx;
              const slotM = c.kind === "marquee" ? marquee[c.slot ?? -1] : undefined;
              const count =
                c.kind === "marquee"
                  ? (marquee.length ? (slotM ? 1 : 0) : undefined)
                  : c.kind === "rank" ? netOps.length
                  : c.kind === "wire" ? situations.length
                  : c.kind === "tape" ? tapes.length
                  : (clockNext.length || tiles.length);
              const isLive = (count ?? 0) > 0;
              const dot = on ? "#000" : isLive ? TT.green : "#444";
              const label = slotM?.name ?? c.name;
              const accent = slotM?.color ?? c.color;
              return (
                <button
                  key={c.num}
                  onClick={() => tune(i)}
                  title={slotM ? slotM.title : count === undefined ? "tuning…" : isLive ? `${count} live` : "no signal"}
                  style={{
                    cursor: "pointer",
                    border: `1px solid ${on ? accent : "#333"}`,
                    background: on ? accent : "transparent",
                    color: on ? "#000" : accent,
                    fontFamily: "inherit",
                    fontWeight: 900,
                    fontSize: "0.68rem",
                    letterSpacing: "0.08em",
                    padding: "0.3rem 0.55rem",
                  }}
                >
                  <span style={{ color: dot }}>●</span> {pad(c.num)} {label}
                </button>
              );
            })}
          </div>

          {/* ───── TICKER ───── */}
          {tiles.length > 0 && (
            <div style={{ overflow: "hidden", whiteSpace: "nowrap", marginTop: "1rem", borderTop: "1px solid #222", paddingTop: "0.55rem" }}>
              <div style={{ display: "inline-block", animation: "fz-marq 40s linear infinite" }}>
                {[...tiles, ...tiles].map((t, i) => (
                  <span key={i} style={{ color: TT.grey, fontSize: "0.68rem", letterSpacing: "0.06em", marginRight: "2.5rem" }}>
                    <span style={{ color: TT.cyan }}>◂</span> {t.topMarket || t.label} <span style={{ color: TT.yellow, fontWeight: 900 }}>{Math.round(t.topYesPct)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Four-colour navigation bar (jumps to channels) */}
          <div style={{ display: "flex", gap: 0, marginTop: "1.1rem" }}>
            {[
              { c: TT.red, l: "WIRE", idx: CHANNELS.findIndex((x) => x.kind === "wire") },
              { c: TT.green, l: "RANK", idx: CHANNELS.findIndex((x) => x.kind === "rank") },
              { c: TT.yellow, l: "GUIDE", idx: CHANNELS.findIndex((x) => x.kind === "guide") },
              { c: TT.cyan, l: marquee[0]?.name ?? "CH 01", idx: CHANNELS.findIndex((x) => x.kind === "marquee") },
            ].map((b) => (
              <button
                key={b.l}
                onClick={() => b.idx >= 0 && tune(b.idx)}
                style={{ flex: 1, textAlign: "center", background: b.c, color: "#000", fontWeight: 900, fontSize: "0.7rem", letterSpacing: "0.1em", padding: "0.45rem 0", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                {b.l}
              </button>
            ))}
          </div>
          <div style={{ color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.04em", paddingTop: "0.7rem" }}>
            DENPA PROTOCOL · REFERENCE FORK · LIVE VIA denpa.ai
          </div>
        </div>
      </main>
    </div>
  );
}
