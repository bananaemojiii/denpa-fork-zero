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

/* ───────────── Broadcast segment — the shape the channel clock airs ───────────── */
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

/* ───────────── Price history / chart (denpa.ai) ───────────── */
export interface PricePoint {
  ts: number; // unix ms
  p: number; // YES probability 0–100
}

// 60 min of 1-minute YES-price history for the chart. Empty array on any failure
// (market without a yes token, history unavailable) — the chart just renders flat.
// interval: "1H" · "24H" (default) · "7D" · "ALL". ALL is the market's whole arc —
// what a marquee channel airs, since a question with months of runway has a timeline,
// not a wiggle. The route maps these onto CLOB prices-history ranges.
export type HistoryInterval = "1H" | "24H" | "7D" | "ALL";
export async function fetchHistory(marketId: string, interval: HistoryInterval = "24H"): Promise<PricePoint[]> {
  const id = encodeURIComponent(marketId);
  try {
    // Documented endpoint: {history:[{t,p}]} — t in ms or s, p as 0–1 or 0–100 depending on version. Normalise both.
    const d = await getJSON<{ history: { t: number; p: number }[] }>(`${WEB}/api/polymarket/market-history?marketId=${id}&interval=${interval}`);
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

/* ───────────── One market, normalized — the hub's canonical market shape ─────────────
   GET /api/network/market/:id resolves ANY protocol id (numeric = Polymarket,
   `kalshi-…`, `lmt-…`) to one shape, so a marquee channel is venue-agnostic:
   {market:{id,provider,title,yesPrice,noPrice,volume,status,outcome,endDate,url}}. */
export interface DenpaMarket {
  id: string;
  provider: string;
  title: string;
  yesPrice: number | null; // 0–1
  noPrice: number | null;
  volume: number | null;
  status: "open" | "closed" | "resolved" | "unknown" | string;
  outcome: string | null;
  endDate: string | null;
  url: string;
  updatedAt: string;
}
export async function fetchMarket(id: string): Promise<DenpaMarket | null> {
  try {
    const d = await getJSON<{ market: DenpaMarket }>(`${WEB}/api/network/market/${encodeURIComponent(id)}`);
    return d.market ?? null;
  } catch {
    return null;
  }
}

/* ───────────── The marquee band — a long-running market IS the channel ─────────────
   Not a category: one question with months of runway, aired as its own channel, so the
   price arc is the programme. Pins are marquee questions in priority order; a pin that
   resolves or closes drops off the dial by itself and the band is topped up from the
   protocol's own market list — open, ≥90 days of runway, biggest first, one per
   question family so a 128-bucket event can't swallow the dial. */
export interface MarqueePin {
  id: string;
  name: string; // channel name on the dial
  color: string;
}
export const MARQUEE_PINS: MarqueePin[] = [
  { id: "668591", name: "GTA VI", color: "#ffff00" },
  { id: "665374", name: "IRAN", color: "#ff0000" },
  { id: "567621", name: "TAIWAN", color: "#00ffff" },
  { id: "703257", name: "CONTACT", color: "#00ff00" },
  { id: "561230", name: "2028", color: "#ffffff" },
  { id: "1163699", name: "CLARITY", color: "#ff00ff" },
  // Reserves — promoted onto the dial as the pins above resolve.
  { id: "663583", name: "TEHRAN", color: "#ff0000" },
  { id: "560317", name: "KREMLIN", color: "#ffffff" },
  { id: "559651", name: "BEIJING", color: "#00ffff" },
  { id: "1363069", name: "GTA PRICE", color: "#ffff00" },
];

export interface MarqueeMarket extends DenpaMarket {
  name: string;
  color: string;
}

// One row of /api/polymarket/markets — the auto-fill pool.
interface ListedMarket {
  id: string;
  name: string;
  yesPct: number; // 0–100
  volume: number;
  closed: boolean;
  closesAt: string;
}

export const MARQUEE_SLOTS = 6;
const AUTOFILL_MIN_DAYS = 90;
const AUTOFILL_COLORS = ["#00ff00", "#ffff00", "#00ffff", "#ff00ff", "#ffffff", "#ff0000"];

// Question-family key: "Will Mike Pence win the 2028 Republican presidential nomination?"
// and its 127 siblings collapse to one key, so one event can't take every slot.
function familyKey(title: string): string {
  const t = title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/^will (the )?/, "");
  return t.split(" ").slice(-6).join(" ");
}

// Short dial name derived from a question, for auto-filled slots.
function autoName(title: string): string {
  const words = title
    .replace(/^will\s+(the\s+)?/i, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return (words.slice(0, 2).join(" ") || "MARKET").toUpperCase().slice(0, 11);
}

export async function fetchMarquee(): Promise<MarqueeMarket[]> {
  const resolved = await Promise.all(
    MARQUEE_PINS.map(async (pin) => {
      const m = await fetchMarket(pin.id);
      return m && m.status === "open" ? { ...m, name: pin.name, color: pin.color } : null;
    }),
  );
  const live = resolved.filter((m): m is MarqueeMarket => m !== null).slice(0, MARQUEE_SLOTS);
  if (live.length >= MARQUEE_SLOTS) return live;

  // Not enough pins survived — top up from the protocol's own market list.
  try {
    const d = await getJSON<{ markets: ListedMarket[] }>(`${WEB}/api/polymarket/markets`);
    const seen = new Set(live.map((m) => familyKey(m.title)));
    const cutoff = Date.now() + AUTOFILL_MIN_DAYS * 86_400_000;
    const extra = (d.markets ?? [])
      .filter((m) => !m.closed && new Date(m.closesAt).getTime() > cutoff)
      .sort((a, b) => b.volume - a.volume)
      .filter((m) => {
        const k = familyKey(m.name);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MARQUEE_SLOTS - live.length)
      .map((m, i): MarqueeMarket => ({
        id: m.id,
        provider: "polymarket",
        title: m.name,
        yesPrice: m.yesPct / 100,
        noPrice: 1 - m.yesPct / 100,
        volume: m.volume,
        status: "open",
        outcome: null,
        endDate: m.closesAt,
        url: `${WEB}/m/${m.id}`,
        updatedAt: new Date().toISOString(),
        name: autoName(m.name),
        color: AUTOFILL_COLORS[(live.length + i) % AUTOFILL_COLORS.length],
      }));
    return [...live, ...extra];
  } catch {
    return live;
  }
}

/* ───────────── Channels — the dial ─────────────
   CH 1–6 are the marquee band: one long-running market each, in the order
   fetchMarquee returns them (name + accent come from the market on the slot).
   CH 0 WIRE is what moved (situations); CH 7 RANK is the network operator board;
   CH 8 GUIDE is the channel clock — what the protocol is airing next, across every
   lane; CH 9 TAPE is the federated clip reel. A slot with no market shows TV static. */
export interface Channel {
  num: number;
  name: string; // placeholder for marquee slots — the market on the slot names the channel
  kind: "marquee" | "rank" | "guide" | "wire" | "tape";
  slot?: number; // index into the marquee band for kind:"marquee"
  color: string;
}

export const CHANNELS: Channel[] = [
  { num: 0, name: "WIRE", kind: "wire", color: "#ff0000" },
  { num: 1, name: "CH 01", kind: "marquee", slot: 0, color: "#ffff00" },
  { num: 2, name: "CH 02", kind: "marquee", slot: 1, color: "#ff0000" },
  { num: 3, name: "CH 03", kind: "marquee", slot: 2, color: "#00ffff" },
  { num: 4, name: "CH 04", kind: "marquee", slot: 3, color: "#00ff00" },
  { num: 5, name: "CH 05", kind: "marquee", slot: 4, color: "#ffffff" },
  { num: 6, name: "CH 06", kind: "marquee", slot: 5, color: "#ff00ff" },
  { num: 7, name: "RANK", kind: "rank", color: "#00ff00" },
  { num: 8, name: "GUIDE", kind: "guide", color: "#00ffff" },
  { num: 9, name: "TAPE", kind: "tape", color: "#ff00ff" },
];

export const denpaLinks = {
  market: (route: string) => `${WEB}${route}`,
  operator: (callsign: string) => `${WEB}/u/${callsign}`,
};
