import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import {
  fetchLeaderboard,
  fetchHeatmap,
  fetchSchedule,
  fetchHistory,
  fetchProgram,
  fetchSituations,
  fetchTapes,
  fetchNetworkOperators,
  laneFor,
  marketRoute,
  denpaLinks,
  CHANNELS,
  type Channel,
  type OperatorRank,
  type HeatmapTile,
  type BroadcastSegment,
  type ProgramLane,
  type ProgramSegment,
  type PricePoint,
  type Situation,
  type Tape,
  type NetOperator,
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
function Sparkline({ points, color }: { points: PricePoint[]; color: string }) {
  const W = 100;
  const H = 30;
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const xs = points.map((p) => p.ts);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const spanX = maxX - minX || 1;
    return points
      .map((p, i) => {
        const x = ((p.ts - minX) / spanX) * W;
        const y = H - (Math.max(0, Math.min(100, p.p)) / 100) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  if (!path) {
    return <div style={{ color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.1em" }}>CHART · NO HISTORY</div>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 56, display: "block" }}>
      {/* 50% mid line */}
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#222" strokeWidth="0.5" />
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

/* ───────────── Now-playing TV screen (a market on a channel) ───────────── */
function NowPlaying({
  seg,
  channel,
  history,
  remainMs,
  onClock,
}: {
  seg: BroadcastSegment;
  channel: Channel;
  history: PricePoint[];
  remainMs: number;
  onClock: boolean; // true when the segment comes from the canonical channel clock
}) {
  const yes = Math.round(seg.yesPrice);
  const no = 100 - yes;
  // 60-minute YES move from the fetched history (first → last point).
  const delta = history.length >= 2 ? history[history.length - 1].p - history[0].p : null;
  return (
    <div style={{ background: "#070707", padding: "1rem 1.1rem 1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: TT.red, fontWeight: 900, letterSpacing: "0.14em", animation: "fz-blink 1s steps(1) infinite" }}>
          ● ON AIR
        </span>
        <span style={{ color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.12em" }}>
          {onClock ? "CHANNEL CLOCK · NEXT IN" : "RESOLVES IN"} {fmtCountdown(remainMs)}
        </span>
      </div>

      <a
        href={denpaLinks.market(`/m/${seg.id}`)}
        target="_blank"
        rel="noreferrer"
        style={{ color: TT.white, fontWeight: 900, fontSize: "1.15rem", lineHeight: 1.25, display: "block", margin: "0.55rem 0 0.75rem", textDecoration: "none" }}
      >
        {seg.title}
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

      {/* 60-min YES price chart */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.1em" }}>
        <span>60M CHART · YES</span>
        {delta !== null && (
          <span style={{ color: delta >= 0 ? TT.green : TT.red, fontWeight: 900 }}>
            {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}{delta.toFixed(1)} / 60M
          </span>
        )}
      </div>
      <Sparkline points={history} color={channel.color} />

      <div style={{ display: "flex", justifyContent: "space-between", color: TT.grey, fontSize: "0.64rem", letterSpacing: "0.08em", marginTop: "0.35rem" }}>
        <span>VOL ${Math.round((seg.volume || 0) / 1000)}K</span>
        <span>{seg.signals ?? 0} SIGNALS · {seg.tapes ?? 0} TAPES</span>
        <span>{seg.status?.toUpperCase()}</span>
      </div>

      {/* SIGNAL actions — resolve to the denpa.ai market page (money-free forecast) */}
      <div style={{ display: "flex", gap: 0, marginTop: "0.8rem" }}>
        <a
          href={denpaLinks.market(`/m/${seg.id}`)}
          target="_blank"
          rel="noreferrer"
          style={{ flex: 1, textAlign: "center", background: TT.green, color: "#000", fontWeight: 900, fontSize: "0.78rem", letterSpacing: "0.12em", padding: "0.55rem 0", textDecoration: "none" }}
        >
          ▸ SIGNAL YES
        </a>
        <a
          href={denpaLinks.market(`/m/${seg.id}`)}
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

export default function App() {
  const [now, setNow] = useState(new Date());
  const [chIdx, setChIdx] = useState(0);
  // PAUSE holds the now-playing segment and the tape; the clock keeps ticking.
  const [paused, setPaused] = useState(false);
  const channel = CHANNELS[chIdx];

  // Per-channel schedule cache (cat → segments) + global feeds.
  const [schedCache, setSchedCache] = useState<Record<string, BroadcastSegment[]>>({});
  const [board, setBoard] = useState<OperatorRank[]>([]);
  const [netOps, setNetOps] = useState<NetOperator[]>([]);
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
      } else if (e.key === "ArrowUp") tune(chIdx - 1);
      else if (e.key === "ArrowDown") tune(chIdx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chIdx, tune]);

  // Global feeds (leaderboard + heatmap) — initial + 30s refresh.
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [lb, hm, pg, st, tp, op] = await Promise.allSettled([
        fetchLeaderboard(20),
        fetchHeatmap(),
        fetchProgram("resolving"),
        fetchSituations(30, "24h"),
        fetchTapes(20),
        fetchNetworkOperators(),
      ]);
      if (!live) return;
      let errs = 0;
      if (lb.status === "fulfilled") setBoard(lb.value);
      else errs++;
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

  // All market channels' schedules, fetched together — so the zapper can show
  // which channels are live and tuning is instant. Initial + 30s refresh.
  useEffect(() => {
    const cats = CHANNELS.filter((c) => c.kind === "markets" && c.cat).map((c) => c.cat!);
    let live = true;
    const load = async () => {
      const results = await Promise.allSettled(cats.map((cat) => fetchSchedule(cat)));
      if (!live) return;
      setSchedCache((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          next[cats[i]] = r.status === "fulfilled" ? r.value : (next[cats[i]] ?? []);
        });
        return next;
      });
    };
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  // Now-playing for the tuned channel. The canonical channel clock wins when it carries this
  // lane (the content segment on air right now, else the next one); otherwise fall back to
  // the legacy schedule: ON AIR first, else soonest to resolve.
  const sched = channel.cat ? schedCache[channel.cat] : undefined;
  const lane = channel.cat ? laneFor(program, channel.cat) : undefined;
  const clockSegs = useMemo(() => {
    const t = now.getTime();
    const content = (lane?.segs ?? []).filter((s) => s.kind === "content" && new Date(s.endDate).getTime() > t);
    return content.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [lane, now]);
  const onClock = clockSegs.length > 0;
  // Paused: hold the segment on air (same rule as @denpa/sdk onAirSegment —
  // hold the pick, never stop the clock, so resume re-syncs to the rundown).
  const heldSegRef = useRef<BroadcastSegment | ProgramSegment | null>(null);
  const nowSeg: BroadcastSegment | ProgramSegment | null = useMemo(() => {
    if (paused && heldSegRef.current) return heldSegRef.current;
    if (onClock) return clockSegs[0];
    if (!sched || sched.length === 0) return null;
    return sched.find((s) => s.bucket === "ON AIR") ?? sched[0];
  }, [paused, onClock, clockSegs, sched]);
  heldSegRef.current = nowSeg;
  const guide = useMemo<(BroadcastSegment | ProgramSegment)[]>(() => {
    if (onClock) {
      const seen = new Set<string>([clockSegs[0].id]);
      return clockSegs.slice(1).filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).slice(0, 12);
    }
    return (sched ?? []).filter((s) => s.id !== nowSeg?.id).slice(0, 12);
  }, [onClock, clockSegs, sched, nowSeg]);

  // Price history follows the now-playing market.
  useEffect(() => {
    if (!nowSeg) {
      setHistory([]);
      histFor.current = null;
      return;
    }
    if (histFor.current === nowSeg.id) return;
    histFor.current = nowSeg.id;
    let live = true;
    void fetchHistory(nowSeg.id).then((pts) => {
      if (live) setHistory(pts);
    });
    return () => {
      live = false;
    };
  }, [nowSeg]);

  // Live countdown for the now-playing market (endsInMs captured at fetch, decay to clock).
  const fetchedAt = useRef(Date.now());
  useEffect(() => {
    fetchedAt.current = Date.now();
  }, [sched]);
  const remainMs = !nowSeg ? 0 : onClock ? new Date(nowSeg.endDate).getTime() - now.getTime() : nowSeg.endsInMs - (now.getTime() - fetchedAt.current);

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
            <div style={{ color: channel.color, fontWeight: 900, fontSize: "1.1rem", letterSpacing: "0.12em" }}>
              CH {pad(channel.num)} ▸ {channel.name}
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
          ) : channel.kind === "markets" ? (
            sched === undefined ? (
              <div style={{ marginTop: "1rem" }}>
                <TvStatic caption={`TUNING CH ${pad(channel.num)} ${channel.name}…`} />
              </div>
            ) : nowSeg ? (
              <div style={{ marginTop: "1rem" }}>
                <NowPlaying seg={nowSeg} channel={channel} history={history} remainMs={remainMs} onClock={onClock} />
                {/* EPG guide for this channel */}
                {guide.length > 0 && (
                  <>
                    <SectionHead page={`P${100 + channel.num}.G`} title={onClock ? "CHANNEL CLOCK — UP NEXT" : "GUIDE — UP NEXT"} color={channel.color} />
                    {guide.map((s) => (
                      <a key={"segmentId" in s ? s.segmentId : s.id} href={denpaLinks.market(`/m/${s.id}`)} target="_blank" rel="noreferrer" style={{ ...row, textDecoration: "none" }}>
                        <span style={{ color: TT.cyan, width: "3.4rem", flexShrink: 0 }}>{hhmm("startsAt" in s ? s.startsAt : s.endDate)}</span>
                        <span style={{ ...cell, color: TT.white, flex: 1 }}>{s.title}</span>
                        <span style={{ color: TT.grey, width: "5rem", flexShrink: 0, fontSize: "0.64rem", ...cell }}>{s.bucket}</span>
                        <span style={{ color: TT.yellow, width: "3rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>{Math.round(s.yesPrice)}%</span>
                      </a>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div style={{ marginTop: "1rem" }}>
                <TvStatic caption={`NO MARKETS ON CH ${pad(channel.num)} ${channel.name} — TRY ANOTHER CHANNEL`} />
              </div>
            )
          ) : channel.kind === "rank" ? (
            <>
              <SectionHead page="P108" title={netOps.length ? "NETWORK OPERATOR BOARD" : "SIGNAL LEADERBOARD"} color={TT.green} />
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
                    <a key={`${o.origin}:${o.handle}`} href={o.href} target="_blank" rel="noreferrer" style={{ ...row, textDecoration: "none" }}>
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
              ) : board.length === 0 ? (
                <TvStatic caption="LEADERBOARD OFFLINE" />
              ) : (
                <>
                  <div style={{ ...row, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em" }}>
                    <span style={{ width: "2rem", flexShrink: 0 }}>#</span>
                    <span style={{ flex: 1 }}>OPERATOR</span>
                    <span style={{ width: "4.5rem", textAlign: "right", flexShrink: 0 }}>W–L</span>
                    <span style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>SCORE</span>
                    <span style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>ACC</span>
                  </div>
                  {board.map((o) => (
                    <a key={o.privyId} href={denpaLinks.operator(o.callsign)} target="_blank" rel="noreferrer" style={{ ...row, textDecoration: "none" }}>
                      <span style={{ color: TT.cyan, width: "2rem", flexShrink: 0 }}>{o.rank}</span>
                      <span style={{ ...cell, color: TT.white, flex: 1 }}>
                        {o.displayName || o.callsign}
                        {o.pending > 0 && <span style={{ color: TT.grey, fontSize: "0.62rem" }}> · {o.pending} OPEN</span>}
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
              )}
            </>
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
              <SectionHead page="P109" title="GUIDE — TOP MARKETS" color={TT.cyan} />
              {tiles.length === 0 ? (
                <TvStatic caption="GUIDE OFFLINE" />
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
              const count =
                c.kind === "markets"
                  ? (c.cat ? (laneFor(program, c.cat)?.segs.length || schedCache[c.cat]?.length) : undefined)
                  : c.kind === "rank" ? (netOps.length || board.length)
                  : c.kind === "wire" ? situations.length
                  : c.kind === "tape" ? tapes.length
                  : tiles.length;
              const isLive = (count ?? 0) > 0;
              const dot = on ? "#000" : isLive ? TT.green : "#444";
              return (
                <button
                  key={c.num}
                  onClick={() => tune(i)}
                  title={count === undefined ? "tuning…" : isLive ? `${count} live` : "no signal"}
                  style={{
                    cursor: "pointer",
                    border: `1px solid ${on ? c.color : "#333"}`,
                    background: on ? c.color : "transparent",
                    color: on ? "#000" : c.color,
                    fontFamily: "inherit",
                    fontWeight: 900,
                    fontSize: "0.68rem",
                    letterSpacing: "0.08em",
                    padding: "0.3rem 0.55rem",
                  }}
                >
                  <span style={{ color: dot }}>●</span> {pad(c.num)} {c.name}
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
              { c: TT.cyan, l: "SPORT", idx: CHANNELS.findIndex((x) => x.name === "SPORT") },
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
