import { LINE_NAMES, STATION_BY_ID, STATIONS } from '../data/stations';
import { edgesBetween, EXPRESS_ADJ, graphDistance, neighbors } from './graph';
import type {
  Action,
  GameEvent,
  GameState,
  LineId,
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
  startingAp: 10,
  /** 드래프트: 역 하나 선택 기본 비용 */
  draftBaseCost: 1,
  /** 드래프트: 내 영토와 인접하지 않은 역 선택 시 추가 비용 */
  draftDisconnectedSurcharge: 1,
  /** AP 보유 상한: base + perStation × 점령 역 수 */
  apCapBase: 10,
  apCapPerStation: 1,
  /** 연속 점령 체증: 한 턴 안에서 n번째 점령마다 비용 +1 (무료 점령엔 미적용) */
  captureEscalation: 1,
  /** 라운드 이벤트 주기 (이 배수 라운드마다 발생) */
  eventEveryRounds: 3,
  /** 급행 운행 이벤트: 대상 노선 점령 비용 할인 */
  expressEventDiscount: 1,
  /** 시설 점검 이벤트: 전 역 방어 가산 */
  inspectionDefenseBonus: 1,
  /** 두 본진 사이 최소 거리 (엣지 수) */
  minHqDistance: 8,
  /** 턴 리밋 모드 기본 라운드 수 */
  defaultTurnLimit: 20,
  /** 수확 체감 지수: 실수령 = ⌈원수입^지수⌉ (후반 AP 인플레 완화) */
  incomeExponent: 0.8,
  /** 요새화: 비용 / 역당 최대 횟수 / 1회당 방어 — 부수는 쪽이 설치(3AP)보다 비싸도록 +4 */
  fortifyCost: 3,
  fortifyMaxLevel: 2,
  fortifyDefensePerLevel: 4,
  /** 바리케이드: 설치 비용 / 통과 공격 가산 — 돌파(+4)가 설치(3AP)보다 비싸도록 */
  barricadeCost: 3,
  barricadeSurcharge: 4,
};

/** 엣지 키 (방향 무관) */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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

/** 현재 라운드에 효과가 살아 있는 이벤트 */
export function activeEvent(state: GameState): GameEvent | null {
  return state.event && state.event.round === state.round ? state.event : null;
}

/** 요새화·이벤트까지 반영한 실제 방어력 */
export function defenseOf(state: GameState, id: string): number {
  const st = STATION_BY_ID[id];
  if (!st) return 0;
  const ev = activeEvent(state);
  return (
    stationDefense(st, isHqStation(state, id)) +
    (state.fortifications[id] ?? 0) * RULES.fortifyDefensePerLevel +
    (ev?.kind === 'inspection' ? RULES.inspectionDefenseBonus : 0)
  );
}

export function isHqStation(state: GameState, id: string): boolean {
  return state.hq[0] === id || state.hq[1] === id;
}

export function ownedStations(state: GameState, player: PlayerId): string[] {
  return STATIONS.filter((s) => state.owners[s.id] === player).map((s) => s.id);
}

export function playerIncome(state: GameState, player: PlayerId): number {
  const ev = activeEvent(state);
  return ownedStations(state, player).reduce((sum, id) => {
    const st = STATION_BY_ID[id];
    let prod = stationProduction(st, isHqStation(state, id));
    // 파업: 해당 노선 역들의 생산 절반 (내림)
    if (ev?.kind === 'strike' && ev.line && st.lines.includes(ev.line)) {
      prod = Math.floor(prod / 2);
    }
    return sum + prod;
  }, 0);
}

function multiplierOf(state: GameState, player: PlayerId): number {
  return state.incomeMultiplier?.[player] ?? 1;
}

/** 수확 체감을 적용한 실수령 수입 */
export function effectiveIncome(state: GameState, player: PlayerId): number {
  const raw = playerIncome(state, player);
  if (raw <= 0) return 0;
  return Math.ceil(raw ** RULES.incomeExponent * multiplierOf(state, player));
}

export function apCap(state: GameState, player: PlayerId): number {
  return (
    RULES.apCapBase +
    Math.ceil(
      RULES.apCapPerStation * ownedStations(state, player).length * multiplierOf(state, player),
    )
  );
}

// ── 점령 비용/가능 판정 ─────────────────────────────────────
export interface CaptureInfo {
  cost: number;
  viaRiver: boolean;
  /** 상대 바리케이드를 뚫고 가는 경로인지 (+가산, 점령 시 소멸) */
  viaBarricade: boolean;
  /** 급행 점프 경로인지 (사이 역을 건너뜀, 바리케이드 무시) */
  viaExpress: boolean;
  /** 최소 비용 경로의 출발 아군 역 */
  via: string;
  fromOwned: boolean;
  enemyOwned: boolean;
  /** 목표 역과 물리적으로 인접한 내 역 수 (포위 판정 — 급행 제외) */
  supporters: number;
  /** 연속 점령 체증 가산 (이번 턴 n번째 점령) */
  escalation: number;
  /** 급행 운행 이벤트 할인 */
  eventDiscount: number;
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
    defenseOf(state, target) +
    (enemyOwned ? RULES.enemyOwnedSurcharge : 0);

  let best: {
    cost: number;
    viaRiver: boolean;
    viaBarricade: boolean;
    viaExpress: boolean;
    via: string;
  } | null = null;
  let supporters = 0;
  for (const n of neighbors(target)) {
    if (state.owners[n] !== player) continue;
    supporters++;
    const viaRiver = edgesBetween(n, target).every((e) => e.river === true);
    let cost = viaRiver ? Math.ceil(base * RULES.riverCostMultiplier) : base;
    const barOwner = state.barricades[edgeKey(n, target)];
    const viaBarricade = barOwner !== undefined && barOwner !== player;
    if (viaBarricade) cost += RULES.barricadeSurcharge;
    if (best === null || cost < best.cost)
      best = { cost, viaRiver, viaBarricade, viaExpress: false, via: n };
  }
  // 급행 점프: 연속 급행 정차역끼리는 인접 취급 (무정차 통과 — 바리케이드 무시).
  // 포위 supporters에는 세지 않는다 (물리적 포위가 아니므로).
  for (const ex of EXPRESS_ADJ[target] ?? []) {
    if (state.owners[ex.to] !== player) continue;
    const cost = ex.river ? Math.ceil(base * RULES.riverCostMultiplier) : base;
    if (best === null || cost < best.cost)
      best = { cost, viaRiver: ex.river, viaBarricade: false, viaExpress: true, via: ex.to };
  }
  if (best === null) return null;

  let cost = best.cost;
  const surroundFree = enemyOwned && supporters >= RULES.surroundFreeAt;
  // 연속 점령 체증 — 포위 절반(½)보다 먼저 더하고, 그 다음 절반을 적용
  // (2026-07-06 사용자 지시: "절반 후 가산"이 아니라 "가산 후 절반").
  // 무료(3방향 포위) 점령에는 여전히 붙지 않는다.
  const escalation = surroundFree ? 0 : state.capturesThisTurn * RULES.captureEscalation;
  cost += escalation;
  if (enemyOwned) {
    if (surroundFree) cost = 0;
    else if (supporters >= RULES.surroundHalfAt) cost = Math.floor(cost / 2);
  }
  // 급행 운행 이벤트: 대상 노선 점령 할인 (최소 1AP)
  const ev = activeEvent(state);
  let eventDiscount = 0;
  if (cost > 0 && ev?.kind === 'express' && ev.line && st.lines.includes(ev.line)) {
    eventDiscount = Math.min(RULES.expressEventDiscount, cost - 1);
    cost -= eventDiscount;
  }
  return {
    cost,
    viaRiver: best.viaRiver,
    viaBarricade: best.viaBarricade,
    viaExpress: best.viaExpress,
    via: best.via,
    fromOwned: true,
    enemyOwned,
    supporters,
    escalation,
    eventDiscount,
  };
}

/** 현재 플레이어가 지금 점령을 시도할 수 있는 역 목록 (AP 무관) */
export function capturableStations(state: GameState): Map<string, CaptureInfo> {
  const result = new Map<string, CaptureInfo>();
  if (state.phase !== 'playing') return result;
  const seen = new Set<string>();
  const consider = (n: string) => {
    if (seen.has(n)) return;
    seen.add(n);
    const info = captureInfo(state, n);
    if (info) result.set(n, info);
  };
  for (const id of ownedStations(state, state.current)) {
    for (const n of neighbors(id)) consider(n);
    for (const ex of EXPRESS_ADJ[id] ?? []) consider(ex.to);
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
    // 본진은 다른 모든 본진과 최소 거리 유지
    for (let p = 0; p < state.playerCount; p++) {
      if (p === player) continue;
      const otherHq = state.hq[p];
      if (otherHq && graphDistance(otherHq, station) < RULES.minHqDistance) return null;
    }
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
export function createGame(
  mode: VictoryMode,
  turnLimit = RULES.defaultTurnLimit,
  playerCount = 2,
  incomeMultiplier?: number[],
): GameState {
  const n = Math.max(2, Math.min(4, playerCount));
  return {
    mode,
    turnLimit,
    playerCount: n,
    round: 1,
    current: 0,
    phase: 'draft',
    owners: {},
    hq: Array.from({ length: n }, () => null),
    ap: Array.from({ length: n }, () => RULES.startingAp),
    draftDone: Array.from({ length: n }, () => false),
    eliminated: Array.from({ length: n }, () => false),
    fortifications: {},
    barricades: {},
    capturesThisTurn: 0,
    event: null,
    history: [],
    incomeMultiplier,
    winner: null,
    log: [],
  };
}

// ── 라운드 이벤트 ───────────────────────────────────────────
/** FNV-1a — 이벤트 추첨용 결정적 해시 (온라인 전원 동일 결과) */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const EVENT_LABEL: Record<GameEvent['kind'], string> = {
  strike: '파업',
  express: '급행 운행',
  inspection: '시설 점검',
};

export function eventDescription(ev: GameEvent): string {
  const line = ev.line ? LINE_NAMES[ev.line] : '';
  switch (ev.kind) {
    case 'strike':
      return `${line} 노조가 파업에 들어갔습니다. 이번 라운드 동안 ${line} 역들의 생산이 절반이 됩니다.`;
    case 'express':
      return `${line}에 급행이 증편됐습니다. 이번 라운드 동안 ${line} 역 점령 비용 -${RULES.expressEventDiscount}AP.`;
    case 'inspection':
      return `전 역사 안전 시설 점검 중입니다. 이번 라운드 동안 모든 역의 방어 +${RULES.inspectionDefenseBonus}.`;
  }
}

/**
 * 해당 라운드의 이벤트 추첨. 상태의 공유 값만 사용하는 순수 함수라
 * 온라인에서도 전원이 같은 이벤트를 얻는다.
 */
function rollEvent(state: GameState, round: number): GameEvent | null {
  if (round < RULES.eventEveryRounds || round % RULES.eventEveryRounds !== 0) return null;
  const h = fnv1a(`${state.mode}|${state.playerCount}|${state.hq.join(',')}|${round}`);
  const kind = (['strike', 'express', 'inspection'] as const)[h % 3];
  if (kind === 'inspection') return { kind, line: null, round };
  // 대상 노선: 누군가의 역이 있는 노선 중에서 (없으면 이벤트 생략)
  const ownedLines = new Set<LineId>();
  for (const s of STATIONS) {
    if (state.owners[s.id] != null) for (const l of s.lines) ownedLines.add(l);
  }
  const lines = [...ownedLines].sort();
  if (lines.length === 0) return null;
  return { kind, line: lines[Math.floor(h / 3) % lines.length], round };
}

function countStations(state: GameState, player: PlayerId): number {
  return ownedStations(state, player).length;
}

/** 생존 플레이어 목록 */
function activePlayers(state: GameState): PlayerId[] {
  return Array.from({ length: state.playerCount }, (_, i) => i).filter(
    (p) => !state.eliminated[p],
  );
}

/** 다음 차례 (탈락자 건너뜀). 조건이 있으면 그 조건도 만족해야 함. */
function nextPlayer(
  state: GameState,
  from: PlayerId,
  also?: (p: PlayerId) => boolean,
): PlayerId {
  for (let i = 1; i <= state.playerCount; i++) {
    const cand = (from + i) % state.playerCount;
    if (state.eliminated[cand]) continue;
    if (also && !also(cand)) continue;
    return cand;
  }
  return from;
}

/**
 * 플레이어 탈락 처리.
 * transferTo가 있으면 남은 영토를 그 플레이어가 흡수하고, 없으면 중립화.
 */
function eliminate(
  state: GameState,
  player: PlayerId,
  reason: string,
  transferTo: PlayerId | null = null,
): GameState {
  const owners = { ...state.owners };
  const history = [...state.history];
  for (const id of Object.keys(owners)) {
    if (owners[id] === player) {
      owners[id] = transferTo;
      history.push({ r: state.round, s: id, p: transferTo });
    }
  }
  const eliminated = [...state.eliminated];
  eliminated[player] = true;
  return {
    ...state,
    owners,
    eliminated,
    history,
    log: [
      ...state.log,
      `P${player + 1} 탈락 — ${reason}${transferTo !== null ? ` (영토는 P${transferTo + 1}에게 흡수)` : ''}`,
    ],
  };
}

function decideTurnLimitWinner(state: GameState): PlayerId | 'draw' {
  const players = activePlayers(state);
  const counts = players.map((p) => countStations(state, p));
  const maxC = Math.max(...counts);
  let top = players.filter((_, i) => counts[i] === maxC);
  if (top.length === 1) return top[0];
  const incomes = top.map((p) => playerIncome(state, p));
  const maxI = Math.max(...incomes);
  top = top.filter((_, i) => incomes[i] === maxI);
  return top.length === 1 ? top[0] : 'draw';
}

/**
 * 랜덤 시작 배치: 각 플레이어가 10AP를 살 수 있는 만큼 꽉 채워
 * 무작위 역을 뽑는 드래프트를 자동 진행한 액션 목록과 결과 상태.
 * (온라인에서는 방장이 생성해 액션을 중계 → 전원 동일 상태)
 */
export function randomDraftPlan(initial: GameState): { actions: Action[]; state: GameState } {
  let s = initial;
  const actions: Action[] = [];
  let guard = 0;
  while (s.phase === 'draft' && guard++ < 400) {
    const affordable = STATIONS.filter((st) => canDraftPick(s, st.id));
    const action: Action =
      affordable.length === 0
        ? { type: 'draftDone' }
        : {
            type: 'draftPick',
            station: affordable[Math.floor(Math.random() * affordable.length)].id,
          };
    const next = applyAction(s, action);
    if (next === s) break; // 안전장치 (진행 불가 상태)
    actions.push(action);
    s = next;
  }
  return { actions, state: s };
}

/**
 * 개전 수확: 전원에게 첫 수확을 미리 지급한다.
 * 랜덤 배정은 드래프트에서 AP를 전부 소진하므로, 턴 종료 없이 바로
 * 플레이할 수 있도록 시작 시점에 한 번 수확해 준다. (결정적 연산)
 */
export function grantInitialHarvest(state: GameState): GameState {
  const ap = state.ap.map((a, p) =>
    Math.min(a + effectiveIncome(state, p), apCap(state, p)),
  );
  return { ...state, ap, log: [...state.log, '개전 수확 — 전원 첫 수입 지급'] };
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

      // 아직 드래프트를 끝내지 않은 다음 플레이어에게 차례를 넘긴다
      const next = nextPlayer(state, player, (p) => !state.draftDone[p]);
      return {
        ...state,
        owners,
        ap,
        hq,
        current: next,
        history: [...state.history, { r: state.round, s: action.station, p: player }],
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
      const allDone = draftDone.every(Boolean);
      const next = allDone
        ? 0
        : nextPlayer({ ...state, draftDone }, player, (p) => !draftDone[p]);
      return {
        ...state,
        draftDone,
        phase: allDone ? 'playing' : 'draft',
        current: next,
        log: [...state.log, `P${player + 1} 시작 역 선택 완료${allDone ? ' — 게임 시작!' : ''}`],
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
      // 점령된 역의 요새는 파괴, 뚫고 들어온 바리케이드는 소멸
      const fortifications = { ...state.fortifications };
      delete fortifications[action.station];
      const barricades = { ...state.barricades };
      if (info.viaBarricade) delete barricades[edgeKey(info.via, action.station)];

      let next: GameState = {
        ...state,
        ap,
        owners,
        fortifications,
        barricades,
        capturesThisTurn: state.capturesThisTurn + 1,
        history: [...state.history, { r: state.round, s: action.station, p: player }],
        log: [
          ...state.log,
          `P${player + 1} ${info.enemyOwned ? '탈환' : '점령'}: ${action.station} (-${info.cost}AP${info.viaRiver ? ', 도하' : ''}${info.viaExpress ? ', 급행 점프' : ''}${info.viaBarricade ? ', 바리케이드 돌파' : ''}${info.escalation > 0 ? `, 연속 +${info.escalation}` : ''})`,
        ],
      };

      if (state.mode === 'annihilation') {
        // 전멸전: 역이 0개가 된 플레이어는 탈락. 마지막 생존자가 승리.
        for (const p of activePlayers(next)) {
          if (p !== player && next.hq[p] !== null && countStations(next, p) === 0) {
            next = eliminate(next, p, '전멸');
          }
        }
      } else {
        // 본진 함락전/정복전: 본진을 잃은 플레이어는 탈락, 영토는 정복자가 흡수
        for (const p of activePlayers(next)) {
          if (p !== player && next.hq[p] === action.station) {
            next = eliminate(next, p, '본진 함락', player);
          }
        }
      }

      const alive = activePlayers(next);
      if (alive.length === 1) {
        return {
          ...next,
          phase: 'over',
          winner: alive[0],
          log: [...next.log, `P${alive[0] + 1} 승리!`],
        };
      }
      return next;
    }

    case 'fortify': {
      if (state.phase !== 'playing') return state;
      const player = state.current;
      if (state.owners[action.station] !== player) return state;
      const level = state.fortifications[action.station] ?? 0;
      if (level >= RULES.fortifyMaxLevel) return state;
      if (state.ap[player] < RULES.fortifyCost) return state;
      const ap: GameState['ap'] = [...state.ap];
      ap[player] -= RULES.fortifyCost;
      return {
        ...state,
        ap,
        fortifications: { ...state.fortifications, [action.station]: level + 1 },
        log: [
          ...state.log,
          `P${player + 1} 요새화: ${action.station} Lv.${level + 1} (방어 +${RULES.fortifyDefensePerLevel}, -${RULES.fortifyCost}AP)`,
        ],
      };
    }

    case 'barricade': {
      if (state.phase !== 'playing') return state;
      const player = state.current;
      if (edgesBetween(action.a, action.b).length === 0) return state;
      // 내 역과 맞닿은 구간에만 설치 가능
      if (state.owners[action.a] !== player && state.owners[action.b] !== player) return state;
      const key = edgeKey(action.a, action.b);
      if (state.barricades[key] !== undefined) return state;
      if (state.ap[player] < RULES.barricadeCost) return state;
      const ap: GameState['ap'] = [...state.ap];
      ap[player] -= RULES.barricadeCost;
      return {
        ...state,
        ap,
        barricades: { ...state.barricades, [key]: player },
        log: [
          ...state.log,
          `P${player + 1} 바리케이드: ${action.a}↔${action.b} (-${RULES.barricadeCost}AP)`,
        ],
      };
    }

    case 'endTurn': {
      if (state.phase !== 'playing') return state;
      const player = state.current;

      // 턴 종료 시 수확: 체감 적용된 실수령 AP를 다음 턴을 위해 비축
      const income = effectiveIncome(state, player);
      const ap: GameState['ap'] = [...state.ap];
      ap[player] = Math.min(ap[player] + income, apCap(state, player));

      const np = nextPlayer(state, player);
      // 인덱스가 감기면(순환 완료) 라운드 증가
      const nextRound = np <= player ? state.round + 1 : state.round;

      // 라운드가 바뀌면 이벤트 추첨 (결정적 — 온라인 전원 동일)
      const event =
        nextRound > state.round ? rollEvent(state, nextRound) : state.event;
      const eventLog =
        event && event.round === nextRound && nextRound > state.round
          ? [`📢 이벤트 — ${event.line ? `${LINE_NAMES[event.line]} ` : ''}${EVENT_LABEL[event.kind]}`]
          : [];

      const next: GameState = {
        ...state,
        ap,
        current: np,
        round: nextRound,
        capturesThisTurn: 0,
        event,
        log: [...state.log, `P${player + 1} 턴 종료 (+${income}AP)`, ...eventLog],
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
