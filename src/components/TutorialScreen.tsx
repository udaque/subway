import { useEffect, useState } from 'react';
import { RULES } from '../game/engine';
import { sfx } from '../game/sound';
import { PLAYER_COLORS, TIER_FILL } from './MapCanvas';
import type { CityTier, Depth } from '../game/types';

/**
 * 튜토리얼 — 본게임과 별개의 초소형 맵으로 메커니즘을 하나씩 체험.
 * 비용 공식과 수치는 본게임 RULES를 그대로 사용해 실전과 일치시킨다.
 */

interface TutStation {
  id: string;
  x: number;
  y: number;
  depth: Depth;
  tier: CityTier;
  owner: 0 | 1 | null;
  disabled?: boolean;
}

interface TutStep {
  title: string;
  text: string;
  ap: number;
  stations: TutStation[];
  edges: Array<[string, string] | [string, string, 'river']>;
  /** 단계의 행동 종류 (기본: 점령) */
  kind?: 'fortify' | 'barricade';
  /** 완료 목표: 점령/요새화할 역 (바리케이드 단계에서는 무시) */
  goal: string;
  /** 완료 시 보여줄 요점 정리 */
  success: string;
  /** 특정 역 클릭 시 안내만 하고 점령을 막는다 (교육용) */
  blockHints?: Record<string, string>;
  showEndTurn?: boolean;
}

const DEF = RULES.defenseByDepth;
const PROD = RULES.productionByTier;

const STEPS: TutStep[] = [
  {
    title: '인접한 역 점령하기',
    text:
      `노선으로 이어진, 내 역과 인접한 역만 점령할 수 있어요. ` +
      `배지의 숫자가 점령 비용입니다. 옆의 지하역(기본 ${RULES.captureBaseCost} + 방어 ${DEF.underground} = 3AP)을 점령해보세요!`,
    ap: 3,
    stations: [
      { id: '비활성A', x: 45, y: 100, depth: 'underground', tier: 'normal', owner: null, disabled: true },
      { id: '내 본진', x: 140, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '목표역', x: 235, y: 100, depth: 'underground', tier: 'normal', owner: null },
      { id: '비활성B', x: 330, y: 100, depth: 'underground', tier: 'normal', owner: null, disabled: true },
    ],
    edges: [
      ['비활성A', '내 본진'],
      ['내 본진', '목표역'],
      ['목표역', '비활성B'],
    ],
    goal: '목표역',
    success: '내 영토와 맞닿은 역으로만 전선을 넓힐 수 있어요.',
  },
  {
    title: 'AP가 부족하면 점령할 수 없다',
    text:
      `점령에는 AP(행동 포인트)가 들어요. 지금 AP는 2 — ` +
      `왼쪽 지하역(3AP)은 무리지만, 점선 테두리의 지상역은 방어가 0이라 2AP면 됩니다.`,
    ap: 2,
    stations: [
      { id: '지하역', x: 60, y: 100, depth: 'underground', tier: 'normal', owner: null },
      { id: '내 역', x: 187, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '지상역', x: 315, y: 100, depth: 'surface', tier: 'normal', owner: null },
    ],
    edges: [
      ['지하역', '내 역'],
      ['내 역', '지상역'],
    ],
    goal: '지상역',
    success: '같은 값이면 싼 곳부터! 방어가 낮은 역이 싸게 뚫립니다.',
  },
  {
    title: '턴을 넘기면 AP가 회복된다',
    text:
      `AP가 1뿐이라 아무 데도 못 가네요. 이럴 땐 [턴 종료]! ` +
      `자기 턴이 끝날 때 내 역들이 AP를 생산합니다. 턴을 넘긴 뒤 목표역을 점령하세요.`,
    ap: 1,
    stations: [
      { id: '역A', x: 60, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '역B', x: 187, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '목표역', x: 315, y: 100, depth: 'underground', tier: 'normal', owner: null },
    ],
    edges: [
      ['역A', '역B'],
      ['역B', '목표역'],
    ],
    goal: '목표역',
    success: '점령한 역이 많고 좋을수록 매턴 수입이 커집니다. (수입이 커지면 체감도 생겨요)',
    showEndTurn: true,
  },
  {
    title: '역의 등급 — 도심 · 보통 · 변두리',
    text:
      `역 색깔은 생산 등급이에요: 🟡 도심(${PROD.downtown}AP/턴) · ⚪ 보통(${PROD.normal}) · ⚫ 변두리(${PROD.terminal}). ` +
      `점령 비용이 같다면 생산이 높은 쪽이 이득! 금색 도심역을 점령하세요.`,
    ap: 3,
    stations: [
      { id: '도심역', x: 60, y: 60, depth: 'underground', tier: 'downtown', owner: null },
      { id: '허브', x: 187, y: 110, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '보통역', x: 315, y: 60, depth: 'underground', tier: 'normal', owner: null },
      { id: '변두리역', x: 187, y: 185, depth: 'underground', tier: 'terminal', owner: null },
    ],
    edges: [
      ['도심역', '허브'],
      ['허브', '보통역'],
      ['허브', '변두리역'],
    ],
    goal: '도심역',
    success: '도심·환승역은 경제의 심장입니다. 초반에 선점하세요.',
    blockHints: {
      보통역: '점령할 순 있지만… 같은 3AP면 생산 3짜리 도심역이 낫겠죠? 금색 역으로!',
      변두리역: '변두리는 생산이 1뿐이에요. 지금은 금색 도심역을 노려보세요!',
    },
  },
  {
    title: '역의 깊이 — 지상 · 지하 · 심층',
    text:
      `테두리가 방어력입니다: 점선 지상(방어 ${DEF.surface}) · 실선 지하(${DEF.underground}) · 이중선 심층(${DEF.deep}, 요새!). ` +
      `지금 AP는 2 — 뚫을 수 있는 곳은 지상역뿐이에요.`,
    ap: 2,
    stations: [
      { id: '지상역', x: 60, y: 100, depth: 'surface', tier: 'normal', owner: null },
      { id: '허브', x: 187, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '심층역', x: 315, y: 100, depth: 'deep', tier: 'normal', owner: null },
      { id: '지하역', x: 187, y: 30, depth: 'underground', tier: 'normal', owner: null },
    ],
    edges: [
      ['지상역', '허브'],
      ['허브', '심층역'],
      ['허브', '지하역'],
    ],
    goal: '지상역',
    success: '심층역은 방어하기 좋고, 지상역은 뺏고 뺏기기 쉽습니다. 지형을 읽으세요!',
  },
  {
    title: '한강 건너기',
    text:
      `강을 건너는 공격은 비용이 ×${RULES.riverCostMultiplier}! ` +
      `지하역 3AP가 도하하면 ${Math.ceil(3 * RULES.riverCostMultiplier)}AP가 됩니다. 강 건너 역을 점령해보세요.`,
    ap: 5,
    stations: [
      { id: '남쪽 역', x: 120, y: 160, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '강 건너 역', x: 250, y: 55, depth: 'underground', tier: 'normal', owner: null },
    ],
    edges: [['남쪽 역', '강 건너 역', 'river']],
    goal: '강 건너 역',
    success: '한강은 천연 방어선입니다. 다리목을 지키고, 건널 땐 비용을 각오하세요.',
  },
  {
    title: '포위 공격',
    text:
      `적(파랑) 역이 내 역 ${RULES.surroundHalfAt}곳과 인접하면 점령 비용이 절반(내림)! ` +
      `원래는 기본 2+방어 1+적 점령지 1 = 4AP지만, 포위 덕분에 2AP면 됩니다.`,
    ap: 2,
    stations: [
      { id: '아군 좌', x: 60, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '적 진지', x: 187, y: 100, depth: 'underground', tier: 'normal', owner: 1 },
      { id: '아군 우', x: 315, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
    ],
    edges: [
      ['아군 좌', '적 진지'],
      ['적 진지', '아군 우'],
    ],
    goal: '적 진지',
    success: '적진을 감싸면 싸게 먹습니다. 전선의 모양이 곧 비용이에요.',
  },
  {
    title: '삼중 포위 — 무혈입성',
    text:
      `${RULES.surroundFreeAt}방향 포위는 무료! AP가 하나도 없어도, 심층 요새라도, ` +
      `세 방향에서 감싸면 그냥 접수됩니다.`,
    ap: 0,
    stations: [
      { id: '아군 좌', x: 60, y: 90, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '적 요새', x: 187, y: 90, depth: 'deep', tier: 'normal', owner: 1 },
      { id: '아군 우', x: 315, y: 90, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '아군 하', x: 187, y: 185, depth: 'underground', tier: 'normal', owner: 0 },
    ],
    edges: [
      ['아군 좌', '적 요새'],
      ['적 요새', '아군 우'],
      ['적 요새', '아군 하'],
    ],
    goal: '적 요새',
    success: '완전 포위 앞에서는 요새도 무의미합니다.',
  },
  {
    title: '요새화 — 내 역 지키기',
    text:
      `AP는 방어에도 씁니다. 내 역에 ${RULES.fortifyCost}AP를 투자하면 방어 +1 ` +
      `(역당 최대 +${RULES.fortifyMaxLevel}). 빨간 내 역을 눌러 요새화해보세요! ` +
      `(실전에서는 내 역을 누르면 나오는 패널에서 실행합니다)`,
    ap: 3,
    kind: 'fortify',
    stations: [
      { id: '내 요충지', x: 130, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '적 전초', x: 260, y: 100, depth: 'underground', tier: 'normal', owner: 1 },
    ],
    edges: [['내 요충지', '적 전초']],
    goal: '내 요충지',
    success:
      '육각 테두리 = 요새. 이 역의 점령 비용이 1 비싸졌어요. 단, 뺏기면 요새는 파괴됩니다.',
    blockHints: {
      '적 전초': '지금은 방어를 다질 시간! 빨간 내 역을 눌러 요새화하세요.',
    },
  },
  {
    title: '바리케이드 — 길목 봉쇄',
    text:
      `구간 자체를 막을 수도 있어요. 내 역을 누르고, 이어진 반대쪽 역을 누르면 ` +
      `바리케이드(${RULES.barricadeCost}AP) 설치! 상대가 그 구간으로 공격하면 +${RULES.barricadeSurcharge}AP를 ` +
      `더 내야 하고, 한 번 뚫리면 소멸합니다.`,
    ap: 3,
    kind: 'barricade',
    stations: [
      { id: '내 진지', x: 110, y: 100, depth: 'underground', tier: 'normal', owner: 0 },
      { id: '적 공격로', x: 265, y: 100, depth: 'underground', tier: 'normal', owner: 1 },
    ],
    edges: [['내 진지', '적 공격로']],
    goal: '내 진지',
    success:
      '구간 위 ✕ = 바리케이드. 한강 다리목이나 환승 허브 길목에 치면 최고의 가성비입니다!',
  },
];

interface Props {
  onExit: () => void;
}

export default function TutorialScreen({ onExit }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [owners, setOwners] = useState<Record<string, 0 | 1 | null>>({});
  const [ap, setAp] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [fortLevels, setFortLevels] = useState<Record<string, number>>({});
  const [barricades, setBarricades] = useState<string[]>([]);
  const [barricadeFrom, setBarricadeFrom] = useState<string | null>(null);

  const step = STEPS[stepIdx];

  // 단계 진입 시 초기화
  useEffect(() => {
    const o: Record<string, 0 | 1 | null> = {};
    for (const s of STEPS[stepIdx].stations) o[s.id] = s.owner;
    setOwners(o);
    setAp(STEPS[stepIdx].ap);
    setMsg(null);
    setCleared(false);
    setFortLevels({});
    setBarricades([]);
    setBarricadeFrom(null);
  }, [stepIdx]);

  const stationOf = (id: string) => step.stations.find((s) => s.id === id)!;
  const neighborsOf = (id: string) =>
    step.edges
      .filter((e) => e[0] === id || e[1] === id)
      .map((e) => (e[0] === id ? e[1] : e[0]));
  const isRiverEdge = (a: string, b: string) =>
    step.edges.some((e) => ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) && e[2] === 'river');

  /** 본게임과 동일한 비용 공식 (RULES 상수 공유) */
  const costOf = (id: string): number | null => {
    const st = stationOf(id);
    const owner = owners[id];
    if (owner === 0 || st.disabled) return null;
    const mine = neighborsOf(id).filter((n) => owners[n] === 0);
    if (mine.length === 0) return null;
    const base = RULES.captureBaseCost + DEF[st.depth] + (owner === 1 ? RULES.enemyOwnedSurcharge : 0);
    let best = Infinity;
    for (const n of mine) {
      const c = isRiverEdge(n, id) ? Math.ceil(base * RULES.riverCostMultiplier) : base;
      best = Math.min(best, c);
    }
    if (owner === 1) {
      if (mine.length >= RULES.surroundFreeAt) best = 0;
      else if (mine.length >= RULES.surroundHalfAt) best = Math.floor(best / 2);
    }
    return best;
  };

  const edgeExists = (a: string, b: string) =>
    step.edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));

  const onStationClick = (id: string) => {
    if (cleared) return;
    const st = stationOf(id);
    if (st.disabled) {
      setMsg('이 역은 이번 단계에서는 잠겨 있어요.');
      return;
    }

    // 요새화 단계: 내 역 클릭 = 요새화
    if (step.kind === 'fortify') {
      if (owners[id] !== 0) {
        setMsg(step.blockHints?.[id] ?? '빨간 내 역을 눌러 요새화하세요.');
        return;
      }
      if (ap < RULES.fortifyCost) {
        setMsg(`❌ AP가 부족해요! 요새화에는 ${RULES.fortifyCost}AP가 필요해요.`);
        return;
      }
      setFortLevels((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
      setAp((a) => a - RULES.fortifyCost);
      sfx.build();
      if (id === step.goal) {
        setCleared(true);
        setMsg(null);
      }
      return;
    }

    // 바리케이드 단계: 내 역 → 이어진 반대쪽 역 (2클릭)
    if (step.kind === 'barricade') {
      if (!barricadeFrom) {
        if (owners[id] !== 0) {
          setMsg('먼저 빨간 내 역을 누르세요.');
          return;
        }
        setBarricadeFrom(id);
        setMsg('좋아요! 이제 이어진 반대쪽 역을 누르세요.');
        return;
      }
      if (id === barricadeFrom) {
        setBarricadeFrom(null);
        setMsg('설치를 취소했어요. 다시 내 역부터 누르세요.');
        return;
      }
      if (!edgeExists(barricadeFrom, id)) {
        setMsg('그 역과는 구간이 이어져 있지 않아요.');
        return;
      }
      if (ap < RULES.barricadeCost) {
        setMsg(`❌ AP가 부족해요! 바리케이드에는 ${RULES.barricadeCost}AP가 필요해요.`);
        return;
      }
      setBarricades((b) => [...b, [barricadeFrom, id].sort().join('|')]);
      setAp((a) => a - RULES.barricadeCost);
      setBarricadeFrom(null);
      sfx.build();
      setCleared(true);
      setMsg(null);
      return;
    }

    if (owners[id] === 0) {
      setMsg('이미 내 역이에요.');
      return;
    }
    if (step.blockHints?.[id]) {
      setMsg(step.blockHints[id]);
      return;
    }
    const cost = costOf(id);
    if (cost === null) {
      setMsg('내 역과 인접하지 않은 역은 점령할 수 없어요.');
      return;
    }
    if (cost > ap) {
      setMsg(`❌ AP가 부족해요! ${cost}AP가 필요한데 ${ap}AP뿐이에요.`);
      return;
    }
    setOwners((o) => ({ ...o, [id]: 0 }));
    setAp((a) => a - cost);
    if (owners[id] === 1) sfx.captureEnemy();
    else sfx.capture();
    if (id === step.goal) {
      setCleared(true);
      setMsg(null);
    } else {
      setMsg(null);
    }
  };

  const onEndTurn = () => {
    // 튜토리얼 수확: 내 역들의 생산 합 (체감 적용)
    const raw = step.stations
      .filter((s) => owners[s.id] === 0)
      .reduce((sum, s) => sum + PROD[s.tier], 0);
    const income = Math.ceil(raw ** RULES.incomeExponent);
    setAp((a) => a + income);
    setMsg(`🌾 수확! 내 역들이 ${income}AP를 생산했어요.`);
    sfx.turn();
  };

  const nextStep = () => {
    if (stepIdx + 1 >= STEPS.length) {
      setAllDone(true);
      sfx.win();
    } else {
      setStepIdx(stepIdx + 1);
    }
  };

  if (allDone) {
    return (
      <div className="overlay">
        <div className="setup-card">
          <h1>🎉 튜토리얼 완료!</h1>
          <p className="setup-sub">
            인접 점령부터 삼중 포위까지 — 이제 기본기는 충분해요.
            <br />
            실전에서 수도권을 접수해보세요!
          </p>
          <button className="btn-start" onClick={onExit}>
            메인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="setup-card tut-card">
        <div className="tut-head">
          <span className="tut-progress">
            튜토리얼 {stepIdx + 1}/{STEPS.length}
          </span>
          <button className="btn-ghost tut-exit" onClick={onExit}>
            나가기
          </button>
        </div>
        <h2 className="tut-title">{step.title}</h2>
        <p className="tut-text">{step.text}</p>

        <svg className="tut-map" viewBox="0 0 375 220">
          {/* 한강 (도하 단계) */}
          {step.edges.some((e) => e[2] === 'river') && (
            <path
              d="M -10 130 Q 130 130 200 95 T 390 60"
              stroke="rgba(70,130,200,0.35)"
              strokeWidth={26}
              fill="none"
              strokeLinecap="round"
            />
          )}
          {/* 노선 */}
          {step.edges.map(([a, b, river], i) => {
            const A = stationOf(a);
            const B = stationOf(b);
            return (
              <g key={i}>
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#00A84D" strokeWidth={5} strokeLinecap="round" />
                {river && (
                  <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(255,255,255,0.75)" strokeWidth={1.6} strokeDasharray="6 6" />
                )}
              </g>
            );
          })}
          {/* 바리케이드 마커 (구간 위 ✕) */}
          {barricades.map((key) => {
            const [a, b] = key.split('|');
            const A = stationOf(a);
            const B = stationOf(b);
            const mx = (A.x + B.x) / 2;
            const my = (A.y + B.y) / 2;
            return (
              <g key={key}>
                <circle cx={mx} cy={my} r={13} fill="#12151a" stroke="#e8eaed" strokeWidth={1.5} />
                <line x1={mx - 7} y1={my - 7} x2={mx + 7} y2={my + 7} stroke={PLAYER_COLORS[0]} strokeWidth={3.5} strokeLinecap="round" />
                <line x1={mx + 7} y1={my - 7} x2={mx - 7} y2={my + 7} stroke={PLAYER_COLORS[0]} strokeWidth={3.5} strokeLinecap="round" />
              </g>
            );
          })}
          {/* 역 */}
          {step.stations.map((s) => {
            const owner = owners[s.id];
            // 요새화/바리케이드 단계에서는 점령 배지를 숨긴다 (혼동 방지)
            const cost = cleared || step.kind ? null : costOf(s.id);
            const fort = fortLevels[s.id] ?? 0;
            const hexPts = (R: number) =>
              Array.from({ length: 6 }, (_, k) => {
                const a = -Math.PI / 2 + (k * Math.PI) / 3;
                return `${(s.x + R * Math.cos(a)).toFixed(1)},${(s.y + R * Math.sin(a)).toFixed(1)}`;
              }).join(' ');
            const fill = s.disabled
              ? '#3a4048'
              : owner === null
                ? TIER_FILL[s.tier]
                : PLAYER_COLORS[owner];
            return (
              <g
                key={s.id}
                onClick={() => onStationClick(s.id)}
                style={{ cursor: s.disabled ? 'not-allowed' : 'pointer' }}
              >
                {cost !== null && (
                  <circle cx={s.x} cy={s.y} r={21} fill="none" stroke={`${PLAYER_COLORS[0]}cc`} strokeWidth={3} strokeDasharray={cost > ap ? '5 4' : undefined} />
                )}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={14}
                  fill={fill}
                  stroke="#1a1d23"
                  strokeWidth={s.depth === 'deep' ? 4.5 : 2.5}
                  strokeDasharray={s.depth === 'surface' ? '5 4' : undefined}
                />
                {s.depth === 'deep' && (
                  <circle cx={s.x} cy={s.y} r={9} fill="none" stroke="rgba(26,29,35,0.8)" strokeWidth={1.6} />
                )}
                {fort > 0 && <polygon points={hexPts(21)} fill="none" stroke="#cfd8e3" strokeWidth={2.4} />}
                {fort > 1 && <polygon points={hexPts(26)} fill="none" stroke="#cfd8e3" strokeWidth={2.4} />}
                {barricadeFrom === s.id && (
                  <circle cx={s.x} cy={s.y} r={22} fill="none" stroke="#ffd166" strokeWidth={2.6} strokeDasharray="6 4" />
                )}
                <text x={s.x} y={s.y + 34} textAnchor="middle" fill={s.disabled ? '#5a6270' : '#cfd3da'} fontSize={12}>
                  {s.id}
                </text>
                {cost !== null && (
                  <g>
                    <rect x={s.x + 14} y={s.y - 34} width={26} height={19} rx={5} fill={cost > ap ? 'rgba(70,30,30,0.95)' : 'rgba(30,36,44,0.95)'} stroke={cost > ap ? '#885555' : PLAYER_COLORS[0]} strokeWidth={1} />
                    <text x={s.x + 27} y={s.y - 20} textAnchor="middle" fill={cost > ap ? '#cc8888' : '#fff'} fontSize={12} fontWeight={700}>
                      {cost}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        <div className="tut-bar">
          <span className="tut-ap">
            내 AP: <b>{ap}</b>
          </span>
          {step.showEndTurn && !cleared && (
            <button className="btn-end-turn tut-endturn" onClick={onEndTurn}>
              턴 종료
            </button>
          )}
        </div>

        {msg && !cleared && <div className="tut-msg">{msg}</div>}
        {cleared && (
          <div className="tut-clear">
            <div>✅ {step.success}</div>
            <button className="btn-start tut-next" onClick={nextStep}>
              {stepIdx + 1 >= STEPS.length ? '튜토리얼 마치기' : '다음 단계 →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
