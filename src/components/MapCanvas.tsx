import { useCallback, useEffect, useRef, useState } from 'react';
import { EDGES, LINE_BADGE, LINE_COLORS, RIVER_PATH, STATIONS, STATION_BY_ID } from '../data/stations';
import type { GameState } from '../game/types';
import type { CaptureInfo } from '../game/engine';
import { draftInfo, isHqStation, RULES, stationDefense, stationProduction } from '../game/engine';

export const PLAYER_COLORS = ['#ff5d5d', '#4d9fff'] as const;
/** 중립 역 채움색 — 생산 등급이 한눈에 보이도록 */
export const TIER_FILL = {
  downtown: '#ffd980', // 도심핵심 (생산 3)
  normal: '#f0ece2', // 보통 (생산 2)
  terminal: '#9aa3b0', // 변두리·시종착 (생산 1)
} as const;

const DEPTH_LABEL = { surface: '지상', underground: '지하', deep: '심층' } as const;
const TIER_LABEL = { downtown: '도심핵심', normal: '보통', terminal: '변두리' } as const;

interface Transform {
  scale: number;
  ox: number;
  oy: number;
}

export interface MapHighlights {
  /** 점령 시도 가능한 역 → 비용 정보 */
  capturable: Map<string, CaptureInfo>;
  /** 본진 선택 단계에서 선택 가능한 역 집합 (null이면 해당 없음) */
  pickable: Set<string> | null;
}

/** 점령/선택 순간의 시각 효과 (확장 링) */
export interface MapEffect {
  id: number;
  x: number;
  y: number;
  color: string;
  /** 플레이어 소유지가 넘어간 경우 더 강한 효과 */
  big: boolean;
  start: number;
}

interface Props {
  state: GameState;
  highlights: MapHighlights;
  effects: MapEffect[];
  /** 카메라를 부드럽게 이동시킬 목표 (상대/AI 행동 위치) */
  focus: { x: number; y: number; seq: number } | null;
  /** 터치 선택된 역 (모바일: 1탭 선택 → 정보 패널 → 재탭/버튼으로 실행) */
  selected: string | null;
  /** 상대 턴 등으로 행동이 잠겨 있는지 (선택·열람은 가능) */
  locked: boolean;
  onSelect: (id: string | null) => void;
  onConfirm: (id: string) => void;
}

function fitTransform(w: number, h: number): Transform {
  const xs = STATIONS.map((s) => s.x);
  const ys = STATIONS.map((s) => s.y);
  const pad = 45;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const scale = Math.min(w / (maxX - minX), h / (maxY - minY));
  return {
    scale,
    ox: (w - (minX + maxX) * scale) / 2,
    oy: (h - (minY + maxY) * scale) / 2,
  };
}

const FX_DURATION = 800;

export default function MapCanvas({
  state,
  highlights,
  effects,
  focus,
  selected,
  locked,
  onSelect,
  onConfirm,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const transformRef = useRef<Transform | null>(null);
  transformRef.current = transform;
  const camCancelRef = useRef(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startDist: number;
    startScale: number;
    moved: boolean;
    lastX: number;
    lastY: number;
  } | null>(null);

  // 컨테이너 크기 추적
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 최초 fit
  useEffect(() => {
    if (size.w > 0 && size.h > 0 && transform === null) {
      setTransform(fitTransform(size.w, size.h));
    }
  }, [size, transform]);

  // ── 카메라 팬 애니메이션 (상대/AI 행동 위치로 부드럽게 이동) ──
  useEffect(() => {
    if (!focus || size.w === 0) return;
    const from = transformRef.current;
    if (!from) return;
    const toScale = Math.max(from.scale, 1.5);
    const to = {
      scale: toScale,
      ox: size.w / 2 - focus.x * toScale,
      oy: size.h * 0.45 - focus.y * toScale,
    };
    camCancelRef.current = false;
    const start = performance.now();
    const dur = 450;
    let raf = 0;
    const step = (now: number) => {
      if (camCancelRef.current) return;
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setTransform({
        scale: from.scale + (to.scale - from.scale) * e,
        ox: from.ox + (to.ox - from.ox) * e,
        oy: from.oy + (to.oy - from.oy) * e,
      });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.seq]);

  // ── 점령/선택 효과 오버레이 (확장 링) ─────────────────────
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (effects.length === 0) {
      ctx.clearRect(0, 0, size.w, size.h);
      return;
    }
    let raf = 0;
    const step = () => {
      const t = transformRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (!t) return;
      const now = performance.now();
      let active = false;
      for (const fx of effects) {
        const p = (now - fx.start) / FX_DURATION;
        if (p < 0 || p >= 1) continue;
        active = true;
        const px = fx.x * t.scale + t.ox;
        const py = fx.y * t.scale + t.oy;
        const base = 7 * Math.min(t.scale, 1.35);
        ctx.beginPath();
        ctx.arc(px, py, base + p * 34, 0, Math.PI * 2);
        ctx.strokeStyle = fx.color;
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.stroke();
        if (fx.big) {
          // 소유지가 넘어간 경우: 이중 링 + 플래시
          const p2 = Math.max(0, p - 0.18) / 0.82;
          ctx.beginPath();
          ctx.arc(px, py, base + p2 * 48, 0, Math.PI * 2);
          ctx.strokeStyle = fx.color;
          ctx.globalAlpha = (1 - p2) * 0.7;
          ctx.lineWidth = 2.5 * (1 - p2) + 0.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, base + 4, 0, Math.PI * 2);
          ctx.fillStyle = fx.color;
          ctx.globalAlpha = (1 - p) * 0.3;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (active) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, size.w, size.h);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [effects, size]);

  const toScreen = useCallback(
    (x: number, y: number): [number, number] => {
      const t = transform!;
      return [x * t.scale + t.ox, y * t.scale + t.oy];
    },
    [transform],
  );

  const hitTest = useCallback(
    (sx: number, sy: number): string | null => {
      if (!transform) return null;
      let best: string | null = null;
      let bestD = 18; // px
      for (const s of STATIONS) {
        const [px, py] = [s.x * transform.scale + transform.ox, s.y * transform.scale + transform.oy];
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestD) {
          bestD = d;
          best = s.id;
        }
      }
      return best;
    },
    [transform],
  );

  // ── 렌더링 ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !transform || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = transform;
    const S = t.scale;
    // 노드/라벨/배지 등 UI 요소는 줌인해도 일정 크기 이상 커지지 않게 상한을 둔다.
    // (줌인 = 역 간격이 벌어지는 것이지, 요소가 거대해지는 게 아님)
    const ui = Math.min(S, 1.35);

    ctx.fillStyle = '#12151a';
    ctx.fillRect(0, 0, size.w, size.h);

    // 한강
    ctx.beginPath();
    RIVER_PATH.forEach(([x, y], i) => {
      const [px, py] = toScreen(x, y);
      if (i === 0) ctx.moveTo(px, py);
      else {
        const [prevX, prevY] = RIVER_PATH[i - 1];
        const [cpx, cpy] = toScreen((prevX + x) / 2, (prevY + y) / 2);
        ctx.quadraticCurveTo(cpx, cpy, px, py);
      }
    });
    ctx.strokeStyle = 'rgba(70, 130, 200, 0.30)';
    ctx.lineWidth = 18 * Math.min(S, 2.2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 노선 엣지
    ctx.lineCap = 'round';
    for (const e of EDGES) {
      const a = STATION_BY_ID[e.a];
      const b = STATION_BY_ID[e.b];
      const [ax, ay] = toScreen(a.x, a.y);
      const [bx, by] = toScreen(b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = LINE_COLORS[e.line];
      ctx.lineWidth = Math.max(1.5, Math.min(4.5, 3 * S));
      ctx.setLineDash([]);
      ctx.stroke();
      if (e.river) {
        // 도하 구간 표시 (흰 점선 오버레이)
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(0.8, Math.min(1.8, 1.2 * S));
        ctx.setLineDash([4 * ui, 4 * ui]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 역 노드
    const showAllLabels = S > 1.05;
    for (const s of STATIONS) {
      const [px, py] = toScreen(s.x, s.y);
      const owner = state.owners[s.id] ?? null;
      const isHq = isHqStation(state, s.id);
      const isTransfer = s.lines.length > 1;
      const r = (isTransfer ? 7 : 5) * ui;

      const cap = highlights.capturable.get(s.id);
      // 본진 선택 단계: 선택 불가(상대 본진 인접) 역만 흐리게
      const dimmed = highlights.pickable !== null && !highlights.pickable.has(s.id);
      ctx.globalAlpha = dimmed ? 0.22 : 1;

      // 점령 가능 글로우
      if (cap) {
        ctx.beginPath();
        ctx.arc(px, py, r + 4 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = `${PLAYER_COLORS[state.current]}cc`;
        ctx.lineWidth = 2.2 * ui;
        ctx.setLineDash(cap.cost > state.ap[state.current] ? [3 * ui, 3 * ui] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 본체
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = owner === null ? TIER_FILL[s.cityTier] : PLAYER_COLORS[owner];
      ctx.fill();

      // 테두리 = 깊이 표현
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#1a1d23';
      ctx.lineWidth = (s.depth === 'deep' ? 2.6 : 1.4) * ui;
      if (s.depth === 'surface') ctx.setLineDash([2.2 * ui, 2.2 * ui]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.depth === 'deep') {
        ctx.beginPath();
        ctx.arc(px, py, r - 2.4 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26,29,35,0.8)';
        ctx.lineWidth = 1 * ui;
        ctx.stroke();
      }

      // 본진 링
      if (isHq) {
        ctx.beginPath();
        ctx.arc(px, py, r + 2.2 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.2 * ui;
        ctx.stroke();
      }

      // 터치 선택 링
      if (selected === s.id) {
        ctx.beginPath();
        ctx.arc(px, py, r + 6 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 * ui;
        ctx.setLineDash([4 * ui, 3 * ui]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 라벨
      const showLabel = showAllLabels || isHq || hovered === s.id || cap !== undefined;
      if (showLabel) {
        const fs = Math.max(9, Math.min(12.5, 9.5 * S));
        ctx.font = `${isHq ? 'bold ' : ''}${fs}px 'Pretendard', 'Apple SD Gothic Neo', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const ly = py + r + 3;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(18,21,26,0.85)';
        ctx.strokeText(s.name, px, ly);
        ctx.fillStyle = isHq ? '#ffd166' : '#cfd3da';
        ctx.fillText(s.name, px, ly);
      }

      // 비용 배지
      if (cap) {
        const affordable = cap.cost <= state.ap[state.current];
        const bx = px + r + 3;
        const by = py - r - 3;
        const label = `${cap.cost}`;
        const fs = Math.max(9, Math.min(11.5, 10 * S));
        ctx.font = `bold ${fs}px sans-serif`;
        const tw = ctx.measureText(label).width;
        const bw = tw + 8;
        const bh = fs + 5;
        ctx.beginPath();
        ctx.roundRect(bx, by - bh, bw, bh, 4);
        ctx.fillStyle = affordable ? 'rgba(30,36,44,0.92)' : 'rgba(70,30,30,0.92)';
        ctx.fill();
        ctx.strokeStyle = affordable ? PLAYER_COLORS[state.current] : '#885555';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = affordable ? '#fff' : '#cc8888';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, bx + 4, by - 2);
        if (cap.viaRiver) {
          ctx.font = `${fs * 0.9}px sans-serif`;
          ctx.fillText('🌊', bx + bw + 2, by - 1);
        }
      }

      ctx.globalAlpha = 1;
    }
  }, [state, transform, size, hovered, highlights, selected, toScreen]);

  // ── 인터랙션 ──────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    camCancelRef.current = true; // 사용자 조작 시 카메라 애니메이션 중단
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current = {
        startDist: 0,
        startScale: transform?.scale ?? 1,
        moved: false,
        lastX: e.clientX,
        lastY: e.clientY,
      };
    } else if (pts.length === 2 && transform) {
      const rect = wrapRef.current?.getBoundingClientRect();
      gesture.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startScale: transform.scale,
        moved: true,
        // 핀치 중에는 rect 기준 중간점을 추적 (두 손가락 드래그 = 팬)
        lastX: (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0),
        lastY: (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0),
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setMouse({ x: sx, y: sy });
      if (pointers.current.size === 0) setHovered(hitTest(sx, sy));
    }
    if (!pointers.current.has(e.pointerId) || !transform || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;

    if (pts.length === 1) {
      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      if (g.moved) {
        setTransform((t) => (t ? { ...t, ox: t.ox + dx, oy: t.oy + dy } : t));
        g.lastX = e.clientX;
        g.lastY = e.clientY;
      }
    } else if (pts.length === 2 && rect) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      const factor = g.startDist > 0 ? dist / g.startDist : 1;
      // 중간점 이동량 = 두 손가락 드래그에 의한 팬
      const dmx = midX - g.lastX;
      const dmy = midY - g.lastY;
      g.lastX = midX;
      g.lastY = midY;
      setTransform((t) => {
        if (!t) return t;
        const ns = Math.min(6, Math.max(0.3, g.startScale * factor));
        const k = ns / t.scale;
        const ox = t.ox + dmx;
        const oy = t.oy + dmy;
        return { scale: ns, ox: midX - (midX - ox) * k, oy: midY - (midY - oy) * k };
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasTap = gesture.current && !gesture.current.moved && pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (wasTap) {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (e.pointerType === 'touch') {
          // 터치: 1탭 = 선택(정보 확인), 같은 역 재탭 = 실행, 배경 탭 = 해제
          if (id && id === selected) onConfirm(id);
          else onSelect(id);
        } else if (id) {
          onConfirm(id);
        }
      }
    }
    if (pointers.current.size === 0) {
      gesture.current = null;
    } else if (pointers.current.size === 1) {
      // 핀치 → 팬 전환: 남은 손가락 위치로 기준점을 다시 잡는다.
      // (이걸 안 하면 이전 핀치 중간점과의 차이만큼 화면이 순간이동한다)
      const [rem] = pointers.current.values();
      gesture.current = {
        startDist: 0,
        startScale: transform?.scale ?? 1,
        moved: true,
        lastX: rem.x,
        lastY: rem.y,
      };
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!transform) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setTransform((t) => {
      if (!t) return t;
      const ns = Math.min(6, Math.max(0.3, t.scale * factor));
      const k = ns / t.scale;
      return { scale: ns, ox: mx - (mx - t.ox) * k, oy: my - (my - t.oy) * k };
    });
  };

  const zoomBy = (factor: number) => {
    setTransform((t) => {
      if (!t) return t;
      const ns = Math.min(6, Math.max(0.3, t.scale * factor));
      const k = ns / t.scale;
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { scale: ns, ox: cx - (cx - t.ox) * k, oy: cy - (cy - t.oy) * k };
    });
  };

  // ── 툴팁(마우스) / 정보 패널(터치 선택) ────────────────────
  const hoveredStation = hovered ? STATION_BY_ID[hovered] : null;
  const hoveredCap = hovered ? highlights.capturable.get(hovered) : undefined;
  const hoveredDraft = hovered && state.phase === 'draft' ? draftInfo(state, hovered) : null;

  const selStation = selected ? STATION_BY_ID[selected] : null;
  const selCap = selected && !locked ? highlights.capturable.get(selected) : undefined;
  const selDraft =
    selected && !locked && state.phase === 'draft' ? draftInfo(state, selected) : null;
  const selOwner = selected ? (state.owners[selected] ?? null) : null;
  const myAp = state.ap[state.current];

  return (
    <div
      ref={wrapRef}
      className="map-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHovered(null)}
      onWheel={onWheel}
    >
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} />
      <canvas ref={fxCanvasRef} className="fx-canvas" style={{ width: size.w, height: size.h }} />
      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <button onClick={() => zoomBy(1.35)} aria-label="확대">+</button>
        <button onClick={() => zoomBy(1 / 1.35)} aria-label="축소">−</button>
        <button onClick={() => setTransform(fitTransform(size.w, size.h))} aria-label="전체 보기">⊙</button>
      </div>
      <details className="legend" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <summary>범례 · 점령 비용</summary>
        <div className="legend-body">
          <div className="legend-formula">
            비용 = 기본 {RULES.captureBaseCost} + 방어력
            <span className="legend-dim"> (+{RULES.enemyOwnedSurcharge} 적 점령지, ×{RULES.riverCostMultiplier} 한강 도하)</span>
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-tier-downtown" /> 도심핵심 — 생산 3/턴
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-tier-normal" /> 보통 — 생산 2 · <span className="legend-dot legend-tier-terminal" /> 변두리 — 생산 1
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-tier-normal" style={{ width: 17, height: 17 }} /> 큰 원 = 환승역 — 노선당 생산 +1 (최대 +3)
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-surface" /> 지상역 — 방어 0 (뚫기 쉬움)
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-underground" /> 지하역 — 방어 1
          </div>
          <div className="legend-row">
            <span className="legend-dot legend-deep" /> 심층역 — 방어 2 (요새)
          </div>
          <div className="legend-row">
            <span className="legend-river">〜</span> 한강 도하 구간 — 비용 ×{RULES.riverCostMultiplier}
          </div>
          <div className="legend-row">
            <span className="legend-hq" /> 본진 — 방어 +{RULES.hqDefenseBonus}, 생산 +{RULES.hqProductionBonus}
          </div>
          <div className="legend-row">
            <span className="legend-river">⚔</span> 포위: 적 역이 내 역 {RULES.surroundHalfAt}곳과 인접 → ½, {RULES.surroundFreeAt}곳 이상 → 무료
          </div>
        </div>
      </details>
      {hoveredStation && (
        <div
          className="tooltip"
          style={{
            left: Math.min(mouse.x + 14, size.w - 190),
            top: Math.min(mouse.y + 14, size.h - 130),
          }}
        >
          <div className="tooltip-title">
            {hoveredStation.name}
            {isHqStation(state, hoveredStation.id) && <span className="hq-badge">본진</span>}
          </div>
          <div className="tooltip-lines">
            {hoveredStation.lines.map((l) => (
              <span key={l} className="line-badge" style={{ background: LINE_COLORS[l] }}>
                {LINE_BADGE[l]}
              </span>
            ))}
            <span className="tooltip-tags">
              {TIER_LABEL[hoveredStation.cityTier]} · {DEPTH_LABEL[hoveredStation.depth]}
            </span>
          </div>
          <div className="tooltip-stats">
            생산 +{stationProduction(hoveredStation, isHqStation(state, hoveredStation.id))}/턴
            {' · '}방어 {stationDefense(hoveredStation, isHqStation(state, hoveredStation.id))}
          </div>
          {hoveredDraft && (
            <div className="tooltip-cost">
              <div>선택 비용 {hoveredDraft.cost}AP{hoveredDraft.first && ' — 본진'}</div>
              <div className="tooltip-breakdown">
                기본 {RULES.draftBaseCost}
                {hoveredDraft.transferSurcharge > 0 && ` + 환승 ${hoveredDraft.transferSurcharge}`}
                {hoveredDraft.disconnected && ` + 떨어진 지역 ${RULES.draftDisconnectedSurcharge}`}
              </div>
            </div>
          )}
          {hoveredCap && (
            <div className="tooltip-cost">
              <div>점령 비용 {hoveredCap.cost}AP{hoveredCap.cost === 0 && ' — 포위 점령!'}</div>
              <div className="tooltip-breakdown">
                기본 {RULES.captureBaseCost}
                {stationDefense(hoveredStation, isHqStation(state, hoveredStation.id)) > 0 &&
                  ` + 방어 ${stationDefense(hoveredStation, isHqStation(state, hoveredStation.id))} (${DEPTH_LABEL[hoveredStation.depth]}${isHqStation(state, hoveredStation.id) ? '·본진' : ''})`}
                {hoveredCap.enemyOwned && ` + 적 점령지 ${RULES.enemyOwnedSurcharge}`}
                {hoveredCap.viaRiver && ` → ×${RULES.riverCostMultiplier} 한강 도하`}
                {hoveredCap.enemyOwned &&
                  hoveredCap.supporters >= RULES.surroundHalfAt &&
                  ` → 포위 ${hoveredCap.supporters}방향 ${hoveredCap.supporters >= RULES.surroundFreeAt ? '무료' : '½ (내림)'}`}
              </div>
            </div>
          )}
        </div>
      )}

      {selStation && (
        <div
          className="info-panel"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="info-head">
            <div className="tooltip-title">
              {selStation.name}
              {isHqStation(state, selStation.id) && <span className="hq-badge">본진</span>}
              {selOwner !== null && (
                <span className="owner-dot" style={{ background: PLAYER_COLORS[selOwner] }} />
              )}
            </div>
            <button className="info-close" onClick={() => onSelect(null)} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="tooltip-lines">
            {selStation.lines.map((l) => (
              <span key={l} className="line-badge" style={{ background: LINE_COLORS[l] }}>
                {LINE_BADGE[l]}
              </span>
            ))}
            <span className="tooltip-tags">
              {TIER_LABEL[selStation.cityTier]} · {DEPTH_LABEL[selStation.depth]}
            </span>
          </div>
          <div className="tooltip-stats">
            생산 +{stationProduction(selStation, isHqStation(state, selStation.id))}/턴
            {' · '}방어 {stationDefense(selStation, isHqStation(state, selStation.id))}
          </div>
          {selDraft && (
            <div className="info-action-row">
              <div className="tooltip-breakdown">
                기본 {RULES.draftBaseCost}
                {selDraft.transferSurcharge > 0 && ` + 환승 ${selDraft.transferSurcharge}`}
                {selDraft.disconnected && ` + 떨어진 지역 ${RULES.draftDisconnectedSurcharge}`}
              </div>
              <button
                className="btn-confirm"
                disabled={selDraft.cost > myAp}
                onClick={() => onConfirm(selStation.id)}
              >
                {selDraft.first ? '본진으로 선택' : '선택'} · {selDraft.cost}AP
              </button>
            </div>
          )}
          {selCap && (
            <div className="info-action-row">
              <div className="tooltip-breakdown">
                기본 {RULES.captureBaseCost}
                {stationDefense(selStation, isHqStation(state, selStation.id)) > 0 &&
                  ` + 방어 ${stationDefense(selStation, isHqStation(state, selStation.id))}`}
                {selCap.enemyOwned && ` + 적 ${RULES.enemyOwnedSurcharge}`}
                {selCap.viaRiver && ` → ×${RULES.riverCostMultiplier} 도하`}
                {selCap.enemyOwned &&
                  selCap.supporters >= RULES.surroundHalfAt &&
                  ` → 포위 ${selCap.supporters >= RULES.surroundFreeAt ? '무료' : '½'}`}
              </div>
              <button
                className="btn-confirm"
                disabled={selCap.cost > myAp}
                onClick={() => onConfirm(selStation.id)}
              >
                점령 · {selCap.cost}AP
              </button>
            </div>
          )}
          {!selDraft && !selCap && (
            <div className="tooltip-breakdown">
              {locked
                ? '상대 턴 진행 중'
                : selOwner === state.current
                  ? '내 소유 역'
                  : state.phase === 'playing'
                    ? '내 역과 인접하지 않아 지금은 점령할 수 없어요'
                    : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
