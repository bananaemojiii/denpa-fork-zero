import { useEffect, useState } from "react";
import {
  fetchLeaderboard,
  fetchHeatmap,
  fetchSchedule,
  denpaLinks,
  type OperatorRank,
  type HeatmapTile,
  type BroadcastSegment,
} from "./lib/denpa";

// Classic Ceefax / teletext palette — the retro skin IS the surface.
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

/* ───────────── Dead-channel TV static ───────────── */
function TvStatic({ caption }: { caption: string }) {
  const noise =
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(0,0,0,0.10) 1px, rgba(255,255,255,0.04) 2px, rgba(0,0,0,0.08) 3px)";
  return (
    <div
      style={{
        position: "relative",
        height: 340,
        background: "#0a0a0a",
        border: "2px solid #222",
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

/* ───────────── Section header (teletext page tab) ───────────── */
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

export default function App() {
  const [now, setNow] = useState(new Date());
  const [tiles, setTiles] = useState<HeatmapTile[]>([]);
  const [board, setBoard] = useState<OperatorRank[]>([]);
  const [sched, setSched] = useState<BroadcastSegment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState(0);

  // Clock tick.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Data — initial + 30s refresh. Each source fails independently.
  useEffect(() => {
    let live = true;
    const load = async () => {
      const results = await Promise.allSettled([fetchHeatmap(), fetchLeaderboard(12), fetchSchedule("sport")]);
      if (!live) return;
      let errs = 0;
      if (results[0].status === "fulfilled") setTiles(results[0].value);
      else errs++;
      if (results[1].status === "fulfilled") setBoard(results[1].value);
      else errs++;
      if (results[2].status === "fulfilled") setSched(results[2].value);
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

  const onAir = sched.find((s) => s.bucket === "ON AIR") ?? null;
  const upNext = sched.filter((s) => s.id !== onAir?.id).slice(0, 10);
  const allEmpty = tiles.length === 0 && board.length === 0 && sched.length === 0;

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: TT.bg }}>
      {/* CRT scanline overlay across the whole page — the "static TV" texture. */}
      <style>{`@keyframes fz-blink{0%,49%{opacity:1}50%,100%{opacity:0.3}}`}</style>
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
            <span style={{ color: TT.white }}>P100</span>
            <span style={{ color: TT.cyan, fontWeight: 900, letterSpacing: "0.2em" }}>DENPA · FORK ZERO</span>
            <span style={{ color: TT.green }}>
              {fmtDate(now)} {fmtClock(now)}
            </span>
          </div>

          {/* Double-height masthead */}
          <div style={{ color: TT.yellow, fontWeight: 900, fontSize: "2rem", letterSpacing: "0.05em", margin: "0.7rem 0 0.15rem" }}>
            DENPA FORK ZERO
          </div>
          <div style={{ color: TT.grey, fontSize: "0.7rem", letterSpacing: "0.18em", borderBottom: `2px solid ${TT.magenta}`, paddingBottom: "0.6rem" }}>
            TELETEXT · LIVE SIGNALS VIA DENPA PROTOCOL{errors > 0 ? `  ·  ${errors} FEED(S) OFFLINE` : ""}
          </div>

          {/* Tuning / dead-channel screen until something loads. */}
          {!loaded && (
            <div style={{ marginTop: "1rem" }}>
              <TvStatic caption="TUNING — RESOLVING DENPA SIGNAL…" />
            </div>
          )}
          {loaded && allEmpty && (
            <div style={{ marginTop: "1rem" }}>
              <TvStatic caption="NO MARKETS ON AIR — CHECK BACK SOON" />
            </div>
          )}

          {/* ON AIR row */}
          {onAir && (
            <div style={{ ...row, marginTop: "0.9rem" }}>
              <span style={{ color: TT.red, fontWeight: 900, flexShrink: 0, animation: "fz-blink 1s steps(1) infinite" }}>●ON AIR</span>
              <a href={denpaLinks.market(`/m/${onAir.id}`)} target="_blank" rel="noreferrer" style={{ ...cell, color: TT.white, flex: 1, textDecoration: "none" }}>
                {onAir.title}
              </a>
              <span style={{ color: TT.yellow, fontWeight: 900, flexShrink: 0 }}>{Math.round(onAir.yesPrice)}%</span>
            </div>
          )}

          {/* TOP MARKETS */}
          {tiles.length > 0 && (
            <>
              <SectionHead page="P101" title="TOP MARKETS" color={TT.cyan} />
              {tiles.map((t) => (
                <a
                  key={t.id}
                  href={denpaLinks.market(t.route)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...row, textDecoration: "none" }}
                >
                  <span style={{ ...cell, color: TT.white, flex: 1 }}>{t.topMarket || t.label}</span>
                  <span style={{ color: TT.grey, width: "6rem", flexShrink: 0, fontSize: "0.68rem", letterSpacing: "0.06em", textAlign: "right" }}>
                    ${Math.round(t.totalVol24h / 1000)}K
                  </span>
                  <span style={{ color: TT.yellow, width: "3.4rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>
                    {Math.round(t.topYesPct)}%
                  </span>
                </a>
              ))}
            </>
          )}

          {/* SIGNAL LEADERBOARD */}
          {board.length > 0 && (
            <>
              <SectionHead page="P200" title="SIGNAL LEADERBOARD" color={TT.green} />
              <div style={{ ...row, color: TT.grey, fontSize: "0.66rem", letterSpacing: "0.1em" }}>
                <span style={{ width: "2rem", flexShrink: 0 }}>#</span>
                <span style={{ flex: 1 }}>OPERATOR</span>
                <span style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>SCORE</span>
                <span style={{ width: "4rem", textAlign: "right", flexShrink: 0 }}>ACC</span>
              </div>
              {board.map((o) => (
                <a
                  key={o.privyId}
                  href={denpaLinks.operator(o.callsign)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...row, textDecoration: "none" }}
                >
                  <span style={{ color: TT.cyan, width: "2rem", flexShrink: 0 }}>{o.rank}</span>
                  <span style={{ ...cell, color: TT.white, flex: 1 }}>{o.displayName || o.callsign}</span>
                  <span style={{ color: TT.yellow, width: "4rem", textAlign: "right", flexShrink: 0, fontWeight: 900 }}>{o.score}</span>
                  <span style={{ color: TT.green, width: "4rem", textAlign: "right", flexShrink: 0 }}>{o.accuracy}%</span>
                </a>
              ))}
            </>
          )}

          {/* BROADCAST SCHEDULE */}
          {upNext.length > 0 && (
            <>
              <SectionHead page="P330" title="BROADCAST" color={TT.yellow} />
              {upNext.map((s) => (
                <a
                  key={s.id}
                  href={denpaLinks.market(`/m/${s.id}`)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...row, textDecoration: "none" }}
                >
                  <span style={{ color: TT.cyan, width: "3.4rem", flexShrink: 0 }}>{hhmm(s.endDate)}</span>
                  <span style={{ ...cell, color: TT.white, flex: 1 }}>{s.title}</span>
                  <span style={{ color: TT.grey, width: "5.5rem", flexShrink: 0, fontSize: "0.66rem", letterSpacing: "0.06em", ...cell }}>
                    {s.bucket}
                  </span>
                  <span style={{ color: TT.yellow, width: "3rem", textAlign: "right", flexShrink: 0 }}>{Math.round(s.yesPrice)}%</span>
                </a>
              ))}
            </>
          )}

          {/* FastText — the four-colour navigation bar */}
          <div style={{ display: "flex", gap: 0, marginTop: "1.1rem" }}>
            {[
              { c: TT.red, l: "MARKETS" },
              { c: TT.green, l: "OPERATORS" },
              { c: TT.yellow, l: "BROADCAST" },
              { c: TT.cyan, l: "DENPA.AI" },
            ].map((b) => (
              <span
                key={b.l}
                style={{
                  flex: 1,
                  textAlign: "center",
                  background: b.c,
                  color: "#000",
                  fontWeight: 900,
                  fontSize: "0.7rem",
                  letterSpacing: "0.1em",
                  padding: "0.45rem 0",
                }}
              >
                {b.l}
              </span>
            ))}
          </div>
          <div style={{ color: TT.grey, fontSize: "0.62rem", letterSpacing: "0.04em", paddingTop: "0.7rem" }}>
            DENPA PROTOCOL FORK · DATA VIA denpa.ai + api-production · markets via Polymarket
          </div>
        </div>
      </main>
    </div>
  );
}
