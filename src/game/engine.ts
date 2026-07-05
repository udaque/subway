import { STATION_BY_ID, STATIONS } from '../data/stations';
import { edgesBetween, graphDistance, neighbors } from './graph';
import type {
  Action,
  GameState,
  Owner,
  PlayerId,
  Station,
  VictoryMode,
} from './types';

// ── 밸런스 상수 ─────────────────────────────────────────────
export const RULES = {
  /** 생산 기본치: 도심핵심 / 보통 / 시종착 */
  productionByTier: { downtown: 3, normal: 2, terminal: 1 } as const,
  /** 방어 기본치: 지상 / 지하 / 심층 */
  defenseByDepth: { surface: 0, underground: 1, deep: 2 } as const,
  /** 환승역: 추가 노선 1개당 생산 +1 (최대 +3) */
  transferProductionBonus: 1,
  transferProductionCap: 3,
  /** 본진 보너스 */
  hqProductionBonus: 1,
  hqDefenseBonus: 2,
  /** 점령 기본 비용 */
  captureBaseCost: 2,
  /** 적 소유 역 점령 시 추가 비용 */
  enemyOwnedSurcharge: 1,
  /** 포위: 적 역이 내 역 N곳과 인접하면 비용 절반(내림) / 무료 */
  surroundHalfAt: 2,
  surroundFreeAt: 3,
  /** 한강 도하 비용 배율 */
  riverCostMultiplier: 1.5,
  /** 시작 AP — 드래프트(시작 역 선택)와 초반 운영에 함께 사용 */
  startingAp: [10, 10] as const,
  /** 드래프트: 역 하나 선택 기본 비용 */
  draftBaseCost: 1,
  /** 드래프트: 내 영토와 인접하지 않은 역 선택 시 추가 비용 */
  draftDisconnectedSurcharge: 1,
  /** AP 보유 상한: base + perStation × 점령 역 수 */
  apCapBase: 10,
  apCapPerStation: 2,
  /** 두 본진 사이 최소 거리 (엣지 수) */
  minHqDistance: 8,
  /** 턴 리밋 모드 기본 라운드 수 */
  defaultTurnLimit: 20,
};

// ── 파생 스탯 ───────────────────────────────────────────────
export function stationProduction(st: Station, isHq: boolean): number {
  return (
    RULES.productionByTier[st.cityTier] +
    Math.min(RULES.transferProductionCap, (st.lines.length - 1) * RULES.transferProductionBonus) +
    (isHq ? RULES.hqProductionBonus : 0)
  );
}

export function stationDefense(st: Station, isHq: boolean): number {
  return RULES.defenseByDepth[st.depth] + (isHq ? RULES.hqDefenseBonus : 0);
}

export function isHqStation(state: GameState, id: string): boolean {
  return state.hq[0] === id || state.hq[1] === id;
}

export function ownedStations(state: GameState, player: PlayerId): string[] {
  return STATIONS.filter((s) => state.owners[s.id] === player).map((s) => s.id);
}

export function playerIncome(state: GameState, player: PlayerId): number {
  return ownedStations(state, player).reduce(
    (sum, id) => sum + stationProduction(STATION_BY_ID[id], isHqStation(state, id)),
    0,
  );
}

export function apCap(state: GameState, player: PlayerId): number {
  return RULES.apCapBase + RULES.apCapPerStation * ownedStations(state, player).length;
}

// ── 점령 비용/가능 판정 ─────────────────────────────────────
export interface CaptureInfo {
  cost: number;
  viaRiver: boolean;
  fromOwned: boolean;
  enemyOwned: boolean;
  /** 목표 역과 인접한 내 역 수 (포위 판정) */
  supporters: number;
}

/**
 * 현재 플레이어가 해당 역을 점령할 때의 정보.
 * 인접한 아군 역이 없으면 null. 복수 경로가 있으면 최소 비용 경로 기준.
 * 적 역 포위 시: 내 역 2곳 인접 → 비용 절반(내림), 3곳 이상 → 무료.
 */
export function captureInfo(state: GameState, target: string): CaptureInfo | null {
  const player = state.current;
  const owner: Owner = state.owners[target] ?? null;
  if (owner === player) return null;

  const st = STATION_BY_ID[target];
  if (!st) return null;

  const enemyOwned = owner !== null;
  const base =
    RULES.captureBaseCost +
    stationDefense(st, isHqStation(state, target)) +
    (enemyOwned ? RULES.enemyOwnedSurcharge : 0);

  let best: { cost: number; viaRiver: boolean } | null = null;
  let supporters = 0;
  for (const n of neighbors(target)) {
    if (state.owners[n] !== player) continue;
    supporters++;
    const viaRiver = edgesBetween(n, target).every((e) => e.river === true);
    const cost = viaRiver ? Math.ceil(base * RULES.riverCostMultiplier) : base;
    if (best === null || cost < best.cost) best = { cost, viaRiver };
  }
  if (best === null) return null;

  let cost = best.cost;
  if (enemyOwned) {
    if (supporters >= RULES.surroundFreeAt) cost = 0;
    else if (supporters >= RULES.surroundHalfAt) cost = Math.floor(cost / 2);
  }
  return { cost, viaRiver: best.viaRiver, fromOwned: true, enemyOwned, supporters };
}

/** 현재 플레이어가 지금 점령을 시도할 수 있는 역 목록 (AP 무관) */
export function capturableStations(state: GameState): Map<string, CaptureInfo> {
  const result = new Map<string, CaptureInfo>();
  if (state.phase !== 'playing') return result;
  const seen = new Set<string>();
  for (const id of ownedStations(state, state.current)) {
    for (const n of neighbors(id)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const info = captureInfo(state, n);
      if (info) result.set(n, info);
    }
  }
  return result;
}

// ── 드래프트 (시작 역 선택) ─────────────────────────────────
export interface DraftInfo {
  cost: number;
  /** 환승 가산 비용 (노선 수 - 1) */
  transferSurcharge: number;
  /** 내 영토와 인접하지 않아 +1이 붙었는지 */
  disconnected: boolean;
  /** 이 선택이 첫 선택(=본진)인지 */
  first: boolean;
}

/**
 * 현재 플레이어가 드래프트에서 해당 역을 고를 때의 비용 정보.
 * 고를 수 없는 역(이미 소유됨, 첫 선택인데 상대 본진과 너무 가까움)이면 null.
 */
export function draftInfo(state: GameState, station: string): DraftInfo | null {
  if (state.phase !== 'draft') return null;
  const player = state.current;
  if (state.draftDone[player]) return null;
  if (state.owners[station] != null) return null;
  const st = STATION_BY_ID[station];
  if (!st) return null;

  const first = state.hq[player] === null;
  const transferSurcharge = st.lines.length - 1;
  let disconnected = false;
  if (first) {
    const otherHq = state.hq[(1 - player) as PlayerId];
    if (otherHq && graphDistance(otherHq, station) < RULES.minHqDistance) return null;
  } else {
    disconnected = !neighbors(station).some((n) => state.owners[n] === player);
  }
  const cost =
    RULES.draftBaseCost +
    transferSurcharge +
    (disconnected ? RULES.draftDisconnectedSurcharge : 0);
  return { cost, transferSurcharge, disconnected, first };
}

export function canDraftPick(state: GameState, station: string): boolean {
  const info = draftInfo(state, station);
  return info !== null && info.cost <= state.ap[state.current];
}

// ── 상태 생성/전이 ──────────────────────────────────────────
export function createGame(mode: VictoryMode, turnLimit = RULES.defaultTurnLimit): GameState {
  return {
    mode,
    turnLimit,
    round: 1,
    current: 0,
    phase: 'draft',
    owners: {},
    hq: [null, null],
    ap: [RULES.startingAp[0], RULES.startingAp[1]],
    draftDone: [false, false],
    winner: null,
    log: [],
  };
}

function countStations(state: GameState, player: PlayerId): number {
  return ownedStations(state, player).length;
}

function decideTurnLimitWinner(state: GameState): PlayerId | 'draw' {
  const c0 = countStations(state, 0);
  const c1 = countStations(state, 1);
  if (c0 !== c1) return c0 > c1 ? 0 : 1;
  const p0 = playerIncome(state, 0);
  const p1 = playerIncome(state, 1);
  if (p0 !== p1) return p0 > p1 ? 0 : 1;
  return 'draw';
}

/** 액션 적용. 불가능한 액션이면 원본 상태 그대로 반환. */
export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'over') return state;

  switch (action.type) {
    case 'draftPick': {
      const player = state.current;
      const info = draftInfo(state, action.station);
      if (!info || info.cost > state.ap[player]) return state;

      const owners = { ...state.owners, [action.station]: player };
      const ap: GameState['ap'] = [...state.ap];
      ap[player] -= info.cost;
      const hq: GameState['hq'] = [...state.hq];
      if (info.first) hq[player] = action.station;

      const other = (1 - player) as PlayerId;
      return {
        ...state,
        owners,
        ap,
        hq,
        current: state.draftDone[other] ? player : other,
        log: [
          ...state.log,
          `P${player + 1} ${info.first ? '본진' : '시작 역'}: ${action.station} (-${info.cost}AP)`,
        ],
      };
    }

    case 'draftDone': {
      if (state.phase !== 'draft') return state;
      const player = state.current;
      // 최소 한 역(본진)은 골라야 종료 가능
      if (state.hq[player] === null) return state;
      const draftDone: GameState['draftDone'] = [...state.draftDone];
      draftDone[player] = true;
      const other = (1 - player) as PlayerId;
      const bothDone = draftDone[other];
      return {
        ...state,
        draftDone,
        phase: bothDone ? 'playing' : 'draft',
        current: bothDone ? 0 : other,
        log: [...state.log, `P${player + 1} 시작 역 선택 완료${bothDone ? ' — 게임 시작!' : ''}`],
      };
    }

    case 'capture': {
      if (state.phase !== 'playing') return state;
      const player = state.current;
      const info = captureInfo(state, action.station);
      if (!info || info.cost > state.ap[player]) return state;

      const ap: GameState['ap'] = [...state.ap];
      ap[player] -= info.cost;
      const owners = { ...state.owners, [action.station]: player };
      const next: GameState = {
        ...state,
        ap,
        owners,
        log: [
          ...state.log,
          `P${player + 1} ${info.enemyOwned ? '탈환' : '점령'}: ${action.station} (-${info.cost}AP${info.viaRiver ? ', 도하' : ''})`,
        ],
      };

      const enemy = (1 - player) as PlayerId;

      // 전멸전: 본진 함락으로 끝나지 않고, 상대 역이 0개가 되면 승리
      if (state.mode === 'annihilation') {
        if (countStations(next, enemy) === 0) {
          return {
            ...next,
            phase: 'over',
            winner: player,
            log: [...next.log, `P${player + 1} 승리 — 상대 전멸!`],
          };
        }
        return next;
      }

      // 본진 함락전/정복전: 상대 본진 점령 시 즉시 승리
      if (state.hq[enemy] === action.station) {
        return {
          ...next,
          phase: 'over',
          winner: player,
          log: [...next.log, `P${player + 1} 승리 — 상대 본진 함락!`],
        };
      }
      return next;
    }

    case 'endTurn': {
      if (state.phase !== 'playing') return state;
      const player = state.current;

      // 턴 종료 시 수확: 내 역들이 생산한 AP를 다음 턴을 위해 비축
      const income = playerIncome(state, player);
      const ap: GameState['ap'] = [...state.ap];
      ap[player] = Math.min(ap[player] + income, apCap(state, player));

      const nextPlayer = (1 - player) as PlayerId;
      const nextRound = nextPlayer === 0 ? state.round + 1 : state.round;

      const next: GameState = {
        ...state,
        ap,
        current: nextPlayer,
        round: nextRound,
        log: [...state.log, `P${player + 1} 턴 종료 (+${income}AP)`],
      };

      if (state.mode === 'turnLimit' && nextRound > state.turnLimit) {
        const winner = decideTurnLimitWinner(next);
        return {
          ...next,
          phase: 'over',
          winner,
          log: [
            ...next.log,
            winner === 'draw' ? '무승부' : `P${winner + 1} 승리 — ${state.turnLimit}라운드 종료`,
          ],
        };
      }
      return next;
    }
  }
}
