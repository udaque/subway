import type { VictoryMode } from './types';

/**
 * 챌린지(업적) 정의와 달성 기록.
 * 기록은 localStorage에 영구 저장 — 앱 버전이 바뀌어도 유지된다.
 */

export type Tier = 'bronze' | 'silver' | 'gold';

export interface AchievementDef {
  id: string;
  title: string;
  /** 달성 조건 설명 */
  desc: string;
  tier: Tier;
}

export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold'];
export const TIER_LABEL: Record<Tier, string> = {
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
};
export const TIER_ICON: Record<Tier, string> = { bronze: '🥉', silver: '🥈', gold: '🥇' };

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── 브론즈 ──
  {
    id: 'capture20',
    title: '우리들의 싸움은 지금부터야',
    desc: '한 게임에서 20개 역을 점령한다',
    tier: 'bronze',
  },
  {
    id: 'clearNormal',
    title: '주세요 달콤한 그 맛 아이스크림 케이크',
    desc: 'AI 보통 난이도에서 승리한다',
    tier: 'bronze',
  },
  {
    id: 'tutorial',
    title: '설명서는 이제 필요없어',
    desc: '튜토리얼을 끝까지 완료한다',
    tier: 'bronze',
  },
  {
    id: 'online',
    title: '사람 냄새가 나',
    desc: '온라인 대전을 끝까지 완주한다',
    tier: 'bronze',
  },
  {
    id: 'manualClear',
    title: '첫째도 입지, 둘째도 입지',
    desc: '직접 선택(드래프트) 모드로 시작해 승리한다',
    tier: 'bronze',
  },
  // ── 실버 ──
  {
    id: 'capture100',
    title: '항복하시지',
    desc: '한 게임에서 100개 역을 점령한다',
    tier: 'silver',
  },
  {
    id: 'clearHard',
    title: '이게 되네?',
    desc: 'AI 어려움 난이도에서 승리한다',
    tier: 'silver',
  },
  {
    id: 'allModes',
    title: '다 해본 모드들이구만',
    desc: '본진 함락전·정복전·전멸전 각각에서 한 번 이상 승리한다',
    tier: 'silver',
  },
  // ── 골드 ──
  {
    id: 'captureAll',
    title: '다 이루었도다',
    desc: '수도권 모든 역을 점령한다',
    tier: 'gold',
  },
];

const KEY = 'subway-achievements-v1';

interface Store {
  /** 업적 id → 달성 시각 (epoch ms) */
  unlocked: Record<string, number>;
  /** allModes 진행도: 승리해 본 승리 모드들 */
  modesWon: VictoryMode[];
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Store>;
      return { unlocked: d.unlocked ?? {}, modesWon: d.modesWon ?? [] };
    }
  } catch {
    /* 무시 */
  }
  return { unlocked: {}, modesWon: [] };
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

export function unlockedMap(): Record<string, number> {
  return load().unlocked;
}

/** 새로 달성했으면 정의를 반환, 이미 달성했거나 없는 id면 null */
export function unlock(id: string): AchievementDef | null {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  const s = load();
  if (s.unlocked[id]) return null;
  s.unlocked[id] = Date.now();
  save(s);
  return def;
}

/** 승리 모드 기록 — 세 모드를 모두 이겼으면 allModes 달성 */
export function recordModeWin(mode: VictoryMode): AchievementDef | null {
  const s = load();
  if (!s.modesWon.includes(mode)) {
    s.modesWon.push(mode);
    save(s);
  }
  const all: VictoryMode[] = ['hq', 'turnLimit', 'annihilation'];
  if (all.every((m) => s.modesWon.includes(m))) return unlock('allModes');
  return null;
}
