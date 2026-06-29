/**
 * Display-only cost estimation for the usage/cost dashboard (PRD 5.8).
 * Real spend is authoritative in AI Gateway; these are rough estimates.
 */
const COST = {
  textInputPer1k: 0.0025,
  textOutputPer1k: 0.01,
  audioInputPerMin: 0.06,
  audioOutputPerMin: 0.24,
};

export function estimateCost(args: {
  inputTokens?: number;
  outputTokens?: number;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
}): number {
  const inTok = ((args.inputTokens ?? 0) / 1000) * COST.textInputPer1k;
  const outTok = ((args.outputTokens ?? 0) / 1000) * COST.textOutputPer1k;
  const audioIn = ((args.audioInputSeconds ?? 0) / 60) * COST.audioInputPerMin;
  const audioOut =
    ((args.audioOutputSeconds ?? 0) / 60) * COST.audioOutputPerMin;
  return Number((inTok + outTok + audioIn + audioOut).toFixed(6));
}

/** Start-of-day timestamp (UTC) for daily-limit windows. */
export function startOfTodayUtc(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
