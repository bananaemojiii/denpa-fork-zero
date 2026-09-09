// Denpa protocol client. All data resolves THROUGH denpa.ai — the fork owns its
// surface, denpa owns markets / signals / identity. Two backends, both CORS-open
// to forks (plain REST, no auth for reads, poll ~30s):
//   - API service (api-production-…) → signal leaderboard
//   - denpa.ai web                   → heatmap tiles · channel clock (/api/broadcast/program)
//                                      · legacy schedule · YES price history · situations
//                                      (/api/situations) · federated tapes + operator board
//                                      (/api/network/*)
//
// Configure in .env (see .env.example):
//   VITE_DENPA_API=https://api-production-802f5.up.railway.app
//   VITE_DENPA_WEB=https://denpa.ai

const API = import.meta.env.VITE_DENPA_API ?? "https://api-production-802f5.up.railway.app";
const WEB = import.meta.env.VITE_DENPA_WEB ?? "https://denpa.ai";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/* ───────────── Signal leaderboard (API service) ───────────── */
export interface OperatorRank {
  rank: number;
  privyId: string;
  callsign: string;
  displayName: string;
  score: number;
  total: number;
  won: number;
  lost: number;
  pending: number;
  accuracy: number; // 0–100
}

// operators: "human" (headline) | "all" (includes AI operators, ~2.7× inflated)
export async function fetchLeaderboard(limit = 12, operators: "human" | "all" = "human"): Promise<OperatorRank[]> {
  const d = await getJSON<{ leaderboard: OperatorRank[] }>(
    `${API}/api/v1/signals/leaderboard?limit=${limit}&operators=${operators}`,
  );
  return d.leaderboard ?? [];
}

/* ───────────── Home heatmap tiles (denpa.ai) ───────────── */
export interface HeatmapTile {
  id: string;
  label: string;
  tagline: string;
  route: string; // e.g. "/m/665374"
  totalVol24h: number;
  topMarket: string;
  topYesPct: number; // 0–100
}

export async function fetchHeatmap(): Promise<HeatmapTile[]> {
  const d = await getJSON<{ tiles: HeatmapTile[] }>(`${WEB}/api/polymarket/featured`);
  return d.tiles ?? [];
}

/* ───────────── Broadcast schedule / Gantt (denpa.ai) ───────────── */
export type Bucket = "ON AIR" | "TODAY" | "TOMORROW" | "THIS WEEK" | "THIS MONTH" | "LATER";

export interface BroadcastSegment {
  id: string;
  title: string;
  yesPrice: number; // 0–100
  noPrice: number;
  volume: number;
  endDate: string;
  endsInMs: number;
  bucket: Bucket;
  signals: number;
  tapes: number;
  status: "live" | "resolving" | "resolved";
  eventKey: string;
}

// cat: "sport" | "music" | "crypto" | "politics" | "news" | "culture" | "science"
export async function fetchSchedule(cat = "sport"): Promise<BroadcastSegment[]> {
  const d = await getJSON<{ buckets: Partial<Record<Bucket, BroadcastSegment[]>> }>(
    `${WEB}/api/broadcast/schedule?cat=${cat}`,
  );
  const flat = Object.values(d.buckets ?? {}).flat() as BroadcastSegment[];
  return flat.filter((s) => s.endsInMs > 0).sort((a, b) => a.endsInMs - b.endsInMs);
}

/* ───────────── Price history / chart (denpa.ai) ───────────── */
export interface PricePoint {
  ts: number; // unix ms
  p: number; // YES probability 0–100
}

// 60 min of 1-minute YES-price history for the chart. Empty array on any failure
// (market without a yes token, history unavailable) — the chart just renders flat.
export async function fetchHistory(marketId: string): Promise<PricePoint[]> {
  const id = encodeURIComponent(marketId);
  try {
    // Documented endpoint: {history:[{t,p}]} — t in ms or s, p as 0–1 or 0–100 depending on version. Normalise both.
    const d = await getJSON<{ history: { t: number; p: number }[] }>(`${WEB}/api/polymarket/market-history?marketId=${id}&interval=1H`);
    const h = d.history ?? [];
    if (h.length) {
      const pct = h.some((x) => x.p > 1) ? 1 : 100;
      return h.map((x) => ({ ts: x.t < 1e12 ? x.t * 1000 : x.t, p: x.p * pct }));
    }
  } catch {
    /* fall through to the legacy route */
  }
  try {
    const d = await getJSON<{ points: PricePoint[] }>(`${WEB}/api/polymarket/history?market_id=${id}`);
    return d.points ?? [];
  } catch {
    return [];
  }
}

/* ───────────── Channel clock — the canonical broadcast rundown (denpa.ai) ─────────────
   {enabled:false} when the clock is unwired; otherwise one lane per category with a
   real-time rundown: 10s bumper + 10min content segments, each with startsAt/endDate.
   preset "default" is the rundown the denpa.ai home TV itself rotates through
   (lanes SPORTS · MUSIC · FILM · TV · FASHION · CRYPTO); hot / resolving / close are
   computed channels. A station-scoped clock (Kalshi, other lanes) is
   /api/network/program?providers=&categories= — same shape. */
export interface ProgramSegment extends BroadcastSegment {
  startsAt: string;
  kind: "bumper" | "content";
  category: string;
  segmentId: string;
  takes?: number;
  streams?: number;
}
export interface ProgramLane {
  key: string; // "sports" | "music" | "film" | "tv" | "fashion" | "crypto" | …
  label: string;
  segs: ProgramSegment[];
}
export async function fetchProgram(preset: "default" | "hot" | "resolving" | "close" = "default"): Promise<ProgramLane[] | null> {
  const d = await getJSON<{ enabled: boolean; lanes?: ProgramLane[] }>(`${WEB}/api/broadcast/program?preset=${preset}`);
  return d.enabled ? (d.lanes ?? []) : null;
}
// Lane by clock lane key ("sports", "film", …); tolerant of the legacy singular ("sport").
export function laneFor(lanes: ProgramLane[] | null, cat: string): ProgramLane | undefined {
  if (!lanes) return undefined;
  const c = cat.toLowerCase();
  return lanes.find((l) => l.key === c || l.key === `${c}s` || l.label.toLowerCase() === c || l.label.toLowerCase() === `${c}s`);
}

/* ───────────── Situations — stories of belief movement (denpa.ai /api/situations) ─────────────
   One situation = every moving market in one provider event, collapsed into a single story.
   Read peakDelta (the biggest mover); never sum a situation's deltas. */
export interface SituationMarket {
  marketId: string; // "polymarket:4117967"
  title: string;
  outcome: string;
  fromProbability: number; // 0–1
  toProbability: number;
  delta: number;
  volume: number;
  url: string;
}
export interface Situation {
  id: string;
  eventKey: string;
  provider: string;
  headline: string;
  lane: string; // "TECH" | "CRYPTO" | "POLITICS" | …
  markets: SituationMarket[];
  marketCount: number;
  leadMarketId: string;
  peakDelta: number; // signed, 0–1
  volume: number;
  situationScore: number;
  criticality: "Routine" | "Elevated" | "Critical" | string;
  detectedAt: string;
  url: string;
}
export async function fetchSituations(limit = 30, window: "24h" | "6h" | "1h" = "24h", lane?: string): Promise<Situation[]> {
  const q = new URLSearchParams({ window, limit: String(limit) });
  if (lane) q.set("lane", lane);
  const d = await getJSON<{ situations: Situation[] }>(`${WEB}/api/situations?${q}`);
  return d.situations ?? [];
}
// "polymarket:4117967" → "/m/4117967" on denpa.ai
export const marketRoute = (providerMarketId: string) => `/m/${providerMarketId.replace(/^[a-z]+:/i, "")}`;

/* ───────────── Federated tape reel — clips from every station on the network ───────────── */
export interface Tape {
  id: string;
  origin: string; // "denpa" | "basetv" | …
  originUrl: string;
  handle: string;
  url: string; // HLS manifest (.m3u8)
  marketId: string;
  href: string; // operator page on the origin station
  durationS: number;
  views: number;
  stance: "YES" | "NO" | string;
  createdAt: string;
  boosted: boolean;
}
export async function fetchTapes(limit = 20): Promise<Tape[]> {
  const d = await getJSON<{ tapes: Tape[] }>(`${WEB}/api/network/tapes?limit=${limit}`);
  return (d.tapes ?? []).filter((t) => t.url);
}

/* ───────────── Network operator board — merged field records across stations ───────────── */
export interface NetOperator {
  origin: string;
  originUrl: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  accuracy: number;
  total: number;
  won: number;
  lost: number;
  pending: number;
  followers: number;
  href: string;
}
export async function fetchNetworkOperators(): Promise<NetOperator[]> {
  const d = await getJSON<{ operators: NetOperator[] }>(`${WEB}/api/network/operators`);
  return d.operators ?? [];
}

/* ───────────── Field record — Layer 8 as a hub service (denpa.ai) ─────────────
   GET /api/network/field-record/:handle — the operator's public judgment history,
   served by the hub so forks render it instead of computing their own. */
export interface FieldRecordCall {
  marketId: string;
  marketTitle: string;
  direction: "YES" | "NO";
  status: "won" | "lost" | "pending" | "void";
  createdAt: string;
  receiptUrl?: string | null;
}
export interface FieldRecord {
  handle: string;
  origin: string;
  rank: number | null;
  operators: number;
  score: number;
  calls: number;
  resolved: number;
  correct: number;
  pending: number;
  accuracy: number; // 0–100
  streak: number;
  avgClvBps: number | null;
  recent: FieldRecordCall[];
  profileUrl: string;
}
// null when the hub has no record for the handle (404) — the station page is the fallback.
export async function fetchFieldRecord(handle: string): Promise<FieldRecord | null> {
  try {
    const d = await getJSON<FieldRecord>(`${WEB}/api/network/field-record/${encodeURIComponent(handle)}`);
    return typeof d?.handle === "string" ? { ...d, recent: d.recent ?? [] } : null;
  } catch {
    return null;
  }
}

/* ───────────── Channels — the dial is the clock ───────────── */
export interface Channel {
  num: number;
  name: string;
  kind: "markets" | "rank" | "guide" | "wire" | "tape";
  lane?: string; // channel-clock lane key for kind:"markets" (/api/broadcast/program)
  cat?: string; // legacy schedule category — fallback only where /api/broadcast/schedule knows it
                // (sport · music · crypto · politics · news · culture · science; anything else = sport)
  color: string; // channel accent
}

// The dial mirrors the lanes the denpa.ai home TV itself airs: CH 1–6 are the channel
// clock's lanes (SPORTS · MUSIC · FILM · TV · FASHION · CRYPTO; legacy schedule as
// fallback where it exists). CH 0 WIRE is what moved (situations); CH 7 RANK is the
// network operator board; CH 8 GUIDE is the all-markets heatmap; CH 9 TAPE is the
// federated clip reel. Tuning a dead channel shows the TV-static screen — authentic
// dead-air. Politics / news / science are not on denpa.ai's clock (they are cee.news /
// pund.it lanes) — a fork that wants them asks the hub: /api/network/program?categories=.
export const CHANNELS: Channel[] = [
  { num: 0, name: "WIRE", kind: "wire", color: "#ff0000" },
  { num: 1, name: "SPORTS", kind: "markets", lane: "sports", cat: "sport", color: "#00ff00" },
  { num: 2, name: "MUSIC", kind: "markets", lane: "music", cat: "music", color: "#ff00ff" },
  { num: 3, name: "FILM", kind: "markets", lane: "film", color: "#00ffff" },
  { num: 4, name: "TV", kind: "markets", lane: "tv", color: "#ffffff" },
  { num: 5, name: "FASHION", kind: "markets", lane: "fashion", color: "#ff00ff" },
  { num: 6, name: "CRYPTO", kind: "markets", lane: "crypto", cat: "crypto", color: "#ffff00" },
  { num: 7, name: "RANK", kind: "rank", color: "#00ff00" },
  { num: 8, name: "GUIDE", kind: "guide", color: "#00ffff" },
  { num: 9, name: "TAPE", kind: "tape", color: "#ff00ff" },
];

export const denpaLinks = {
  market: (route: string) => `${WEB}${route}`,
  operator: (callsign: string) => `${WEB}/u/${callsign}`,
};
