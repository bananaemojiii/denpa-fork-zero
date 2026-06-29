// Denpa protocol client. All data resolves THROUGH denpa.ai — the fork owns its
// surface, denpa owns markets / signals / identity. Two backends, both CORS-open
// to forks:
//   - API service (api-production-…) → leaderboard, signals feed
//   - denpa.ai web                   → heatmap tiles, broadcast schedule
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

export const denpaLinks = {
  market: (route: string) => `${WEB}${route}`,
  operator: (callsign: string) => `${WEB}/u/${callsign}`,
};
