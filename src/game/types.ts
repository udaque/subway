export type LineId =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '경의중앙' | '경춘' | '수인분당' | '신분당' | '공항' | '경강'
  | '서해' | '우이신설' | '신림' | '김포골드' | '에버라인' | '의정부'
  | '인천1' | '인천2' | 'GTX-A';

/** 방어 특성: 지상(뚫기 쉬움) / 지하(기본) / 심층(요새) */
export type Depth = 'surface' | 'underground' | 'deep';

/** 생산 특성: 도심핵심 / 보통 / 시종착·변두리 */
export type CityTier = 'downtown' | 'normal' | 'terminal';

export interface Station {
  id: string;
  name: string;
  lines: LineId[];
  x: number;
  y: number;
  depth: Depth;
  cityTier: CityTier;
}

export interface Edge {
  a: string;
  b: string;
  line: LineId;
  /** 한강 도하 구간 (다리/하저터널) */
  river?: boolean;
}

/** 플레이어 인덱스 (0 ~ playerCount-1, 최대 4인) */
export type PlayerId = number;
export type Owner = PlayerId | null;

export type VictoryMode = 'hq' | 'turnLimit' | 'annihilation';

export type Phase = 'draft' | 'playing' | 'over';

/** 라운드 이벤트 — 해당 round 동안만 유효 */
export interface GameEvent {
  kind: 'strike' | 'express' | 'inspection';
  /** 대상 노선 (inspection은 전체 → null) */
  line: LineId | null;
  round: number;
}

/** 리플레이용 소유권 변경 기록 */
export interface OwnershipChange {
  /** 라운드 */
  r: number;
  /** 역 id */
  s: string;
  /** 새 주인 (탈락 중립화는 null) */
  p: PlayerId | null;
}

export interface GameState {
  mode: VictoryMode;
  /** turnLimit 모드에서 총 라운드 수 (전원이 한 번씩 = 1라운드) */
  turnLimit: number;
  /** 참가 인원 (2~4) */
  playerCount: number;
  round: number;
  current: PlayerId;
  phase: Phase;
  owners: Record<string, Owner>;
  /** 각 플레이어가 처음 고른 역 = 본진 */
  hq: (string | null)[];
  ap: number[];
  /** 드래프트(시작 역 선택) 종료 여부 */
  draftDone: boolean[];
  /** 탈락 여부 (본진 함락/전멸) — 탈락자는 턴이 건너뛰어진다 */
  eliminated: boolean[];
  /** 요새화 레벨 (역 id → 추가 방어, 최대 2). 점령당하면 파괴 */
  fortifications: Record<string, number>;
  /** 바리케이드 (정렬된 'a|b' 엣지 키 → 설치자). 뚫리면 소멸 */
  barricades: Record<string, PlayerId>;
  /** 현재 플레이어가 이번 턴에 점령한 횟수 (연속 점령 체증) */
  capturesThisTurn: number;
  /** 진행 중인 라운드 이벤트 (round가 일치할 때만 효과) */
  event: GameEvent | null;
  /** 소유권 변경 기록 (리플레이 타임랩스용) */
  history: OwnershipChange[];
  /** 플레이어별 수입·AP상한 배율 (AI 치트용, 생략 시 전원 1) */
  incomeMultiplier?: number[];
  winner: PlayerId | 'draw' | null;
  log: string[];
}

export type Action =
  | { type: 'draftPick'; station: string }
  | { type: 'draftDone' }
  | { type: 'capture'; station: string }
  | { type: 'fortify'; station: string }
  | { type: 'barricade'; a: string; b: string }
  | { type: 'endTurn' };
