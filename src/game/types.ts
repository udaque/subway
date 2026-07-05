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

export type PlayerId = 0 | 1;
export type Owner = PlayerId | null;

export type VictoryMode = 'hq' | 'turnLimit';

export type Phase = 'pickHQ' | 'playing' | 'over';

export interface GameState {
  mode: VictoryMode;
  /** turnLimit 모드에서 총 라운드 수 (양쪽이 한 번씩 = 1라운드) */
  turnLimit: number;
  round: number;
  current: PlayerId;
  phase: Phase;
  owners: Record<string, Owner>;
  hq: [string | null, string | null];
  ap: [number, number];
  winner: PlayerId | 'draw' | null;
  log: string[];
}

export type Action =
  | { type: 'pickHQ'; station: string }
  | { type: 'capture'; station: string }
  | { type: 'endTurn' };
