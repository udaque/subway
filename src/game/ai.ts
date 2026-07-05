import { STATION_BY_ID, STATIONS } from '../data/stations';
import {
  apCap,
  capturableStations,
  draftInfo,
  playerIncome,
  stationProduction,
  type CaptureInfo,
} from './engine';
import { graphDistance, neighbors } from './graph';
import type { Action, GameState, Station } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

/** AI는 항상 P2(index 1)를 담당한다. */
const AI = 1 as const;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 반경 내 역들의 생산량 합 (본진 주변 경제력 평가) — BFS 한 번으로 계산 */
function areaValue(center: Station, radius: number): number {
  let sum = stationProduction(center, false);
  const visited = new Set([center.id]);
  let frontier = [center.id];
  for (let d = 1; d <= radius; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighbors(id)) {
        if (visited.has(n)) continue;
        visited.add(n);
        next.push(n);
        sum += stationProduction(STATION_BY_ID[n], false) / (d + 1);
      }
    }
    frontier = next;
  }
  return sum;
}

// ── 드래프트 (시작 역 선택) ─────────────────────────────────
function pickDraftHq(state: GameState, difficulty: Difficulty): string {
  const ap = state.ap[AI];
  const candidates = STATIONS.filter((s) => {
    const info = draftInfo(state, s.id);
    return info !== null && info.cost <= ap;
  });
  if (candidates.length === 0) return STATIONS[0].id;

  if (difficulty === 'easy') return pick(candidates).id;

  const enemyHq = state.hq[0];
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    let score = areaValue(c, difficulty === 'hard' ? 3 : 2);
    // 심층/지하 본진 선호 (방어 유리), 환승 본진은 선택 비용이 비싼 것 감안
    if (c.depth === 'deep') score += 2;
    else if (c.depth === 'underground') score += 1;
    score -= (c.lines.length - 1) * 0.5;
    if (difficulty === 'hard' && enemyHq) {
      // 너무 붙지도, 맵 끝에 고립되지도 않게
      const d = graphDistance(c.id, enemyHq);
      score += Math.min(d, 10) * 0.4 - Math.max(0, d - 14) * 0.3;
    }
    // 약간의 무작위성으로 매판 다른 그림
    score += Math.random() * (difficulty === 'hard' ? 0.5 : 2);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best.id;
}

/** 드래프트 단계에서 AI의 다음 행동 (역 선택 또는 선택 완료) */
export function aiDraftAction(state: GameState, difficulty: Difficulty): Action {
  if (state.phase !== 'draft' || state.current !== AI) return { type: 'draftDone' };

  // 첫 선택 = 본진
  if (state.hq[AI] === null) {
    return { type: 'draftPick', station: pickDraftHq(state, difficulty) };
  }

  const ap = state.ap[AI];
  // 초반 공격/방어용 AP를 남겨둔다
  const reserve = difficulty === 'easy' ? 6 : difficulty === 'normal' ? 4 : 3;
  if (ap <= reserve) return { type: 'draftDone' };
  if (difficulty === 'easy' && Math.random() < 0.4) return { type: 'draftDone' };

  const hq = state.hq[AI]!;
  let best: { id: string; score: number } | null = null;
  for (const s of STATIONS) {
    if (state.owners[s.id] != null) continue;
    const info = draftInfo(state, s.id);
    if (!info || info.cost > ap) continue;
    let score = stationProduction(s, false) / info.cost;
    if (difficulty === 'hard') {
      score += (s.lines.length - 1) * 0.15 + (info.disconnected ? -0.1 : 0.25);
      // 본진에서 너무 먼 고립 영토는 지키기 어렵다
      score -= Math.min(graphDistance(hq, s.id), 12) * 0.05;
    } else {
      score += info.disconnected ? -0.2 : 0.1;
    }
    score += Math.random() * 0.1;
    if (!best || score > best.score) best = { id: s.id, score };
  }
  if (!best || best.score < 1.0) return { type: 'draftDone' };
  return { type: 'draftPick', station: best.id };
}

// ── 턴 진행 ────────────────────────────────────────────────
/**
 * AI의 다음 행동 하나를 결정한다.
 * 반환되는 capture는 항상 지불 가능함이 보장된다 (불가능하면 endTurn).
 */
export function aiNextAction(state: GameState, difficulty: Difficulty): Action {
  if (state.phase !== 'playing' || state.current !== AI) return { type: 'endTurn' };

  const ap = state.ap[AI];
  const options: Array<{ id: string; info: CaptureInfo }> = [];
  for (const [id, info] of capturableStations(state)) {
    if (info.cost <= ap) options.push({ id, info });
  }
  if (options.length === 0) return { type: 'endTurn' };

  switch (difficulty) {
    case 'easy':
      return aiEasy(options);
    case 'normal':
      return aiNormal(options);
    case 'hard':
      return aiHard(state, options, ap);
  }
}

/** 쉬움: 무작위 + 자주 턴을 일찍 끝냄. 비용 대비 가치를 안 봄. */
function aiEasy(options: Array<{ id: string; info: CaptureInfo }>): Action {
  if (Math.random() < 0.3) return { type: 'endTurn' };
  return { type: 'capture', station: pick(options).id };
}

/** 보통: 생산/비용 가성비 탐욕. AP 남는 한 계속 점령. */
function aiNormal(options: Array<{ id: string; info: CaptureInfo }>): Action {
  let best: { id: string; score: number } | null = null;
  for (const { id, info } of options) {
    const st = STATION_BY_ID[id];
    let score = stationProduction(st, false) / info.cost;
    if (st.lines.length > 1) score += 0.3;
    if (info.enemyOwned) score += 0.2;
    score += Math.random() * 0.15;
    if (!best || score > best.score) best = { id, score };
  }
  return best ? { type: 'capture', station: best.id } : { type: 'endTurn' };
}

/**
 * 어려움: 즉시 승리 수 우선, 본진 압박, 허브 선점, 모드별 전략.
 * 이길 수 있는 수가 없으면 가치 기반 + 접근 보너스로 평가.
 */
function aiHard(
  state: GameState,
  options: Array<{ id: string; info: CaptureInfo }>,
  ap: number,
): Action {
  const enemyHq = state.hq[0]!;

  // 1) 상대 본진을 지금 점령할 수 있으면 즉시 승리 (전멸전 제외)
  if (state.mode !== 'annihilation') {
    const kill = options.find((o) => o.id === enemyHq);
    if (kill) return { type: 'capture', station: kill.id };
  }

  const lateGame =
    state.mode === 'turnLimit' && state.round > state.turnLimit * 0.6;

  let best: { id: string; score: number } | null = null;
  for (const { id, info } of options) {
    const st = STATION_BY_ID[id];
    const production = stationProduction(st, false);
    let score = production * 1.0 - info.cost * 0.55;

    // 환승 허브는 확장 선택지를 늘린다
    score += (st.lines.length - 1) * 0.8 + (neighbors(id).length - 2) * 0.25;
    // 점령 후 지키기 좋은 역
    if (st.depth === 'deep') score += 0.4;
    // 상대 땅 빼앗기 = 상대 생산력 감소이기도 함 (전멸전에선 그게 곧 승리 조건)
    if (info.enemyOwned) score += state.mode === 'annihilation' ? 1.8 : 1.0;

    if (lateGame) {
      // 정복전 후반: 역 개수가 곧 점수 → 싸게 많이
      score = 3 / info.cost + production * 0.2 + (info.enemyOwned ? 1.5 : 0);
    } else {
      // 상대 본진 방향으로 전선을 민다
      const d = graphDistance(id, enemyHq);
      score += Math.max(0, 9 - d) * 0.35;
    }

    score += Math.random() * 0.1;
    if (!best || score > best.score) best = { id, score };
  }

  if (!best) return { type: 'endTurn' };

  // 가치가 낮은 수에 AP를 흘리지 말고 비축 — 단, 수확이 상한에 잘려 낭비될 상황이면 그냥 쓴다
  const income = playerIncome(state, AI);
  if (best.score < 0.2 && ap + income <= apCap(state, AI)) return { type: 'endTurn' };

  return { type: 'capture', station: best.id };
}
