import { useCallback, useEffect, useRef, useState } from 'react';
import { EDGES, LINE_COLORS, RIVER_PATH, STATIONS, STATION_BY_ID } from '../data/stations';
import type { GameState } from '../game/types';
import type { CaptureInfo } from '../game/engine';
import { isHqStation, stationDefense, stationProduction } from '../game/engine';

export const PLAYER_COLORS = ['#ff5d5d', '#4d9fff'] as const;
export const NEUTRAL_COLOR = '#f0ece2';

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

interface Props {
  state: GameState;
  highlights: MapHighlights;
  onStationClick: (id: string) => void;
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

export default function MapCanvas({ state, highlights, onStationClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

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
    ctx.lineWidth = 18 * S;
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
      ctx.lineWidth = Math.max(1.5, 3 * S);
      ctx.setLineDash([]);
      ctx.stroke();
      if (e.river) {
        // 도하 구간 표시 (흰 점선 오버레이)
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(0.8, 1.2 * S);
        ctx.setLineDash([4 * S, 4 * S]);
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
      const r = (isTransfer ? 7 : 5) * S;

      const cap = highlights.capturable.get(s.id);
      const pickable = highlights.pickable?.has(s.id) ?? false;

      // 점령 가능/선택 가능 글로우
      if (cap || pickable) {
        ctx.beginPath();
        ctx.arc(px, py, r + 4.5 * S, 0, Math.PI * 2);
        ctx.strokeStyle = pickable
          ? 'rgba(255, 209, 102, 0.9)'
          : `${PLAYER_COLORS[state.current]}cc`;
        ctx.lineWidth = 2.5 * S;
        ctx.setLineDash(cap && cap.cost > state.ap[state.current] ? [3 * S, 3 * S] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 본체
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = owner === null ? NEUTRAL_COLOR : PLAYER_COLORS[owner];
      ctx.fill();

      // 테두리 = 깊이 표현
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#1a1d23';
      ctx.lineWidth = (s.depth === 'deep' ? 2.6 : 1.4) * S;
      if (s.depth === 'surface') ctx.setLineDash([2.2 * S, 2.2 * S]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.depth === 'deep') {
        ctx.beginPath();
        ctx.arc(px, py, r - 2.4 * S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26,29,35,0.8)';
        ctx.lineWidth = 1 * S;
        ctx.stroke();
      }

      // 본진 링
      if (isHq) {
        ctx.beginPath();
        ctx.arc(px, py, r + 2.2 * S, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.2 * S;
        ctx.stroke();
      }

      // 라벨
      const showLabel = showAllLabels || isHq || hovered === s.id || cap !== undefined;
      if (showLabel) {
        const fs = Math.max(9, 9.5 * S);
        ctx.font = `${isHq ? 'bold ' : ''}${fs}px 'Pretendard', 'Apple SD Gothic Neo', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const ly = py + r + 2.5 * S;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(18,21,26,0.85)';
        ctx.strokeText(s.name, px, ly);
        ctx.fillStyle = isHq ? '#ffd166' : '#cfd3da';
        ctx.fillText(s.name, px, ly);
      }

      // 비용 배지
      if (cap) {
        const affordable = cap.cost <= state.ap[state.current];
        const bx = px + r + 3 * S;
        const by = py - r - 3 * S;
        const label = `${cap.cost}`;
        const fs = Math.max(9, 10 * S);
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
    }
  }, [state, transform, size, hovered, highlights, toScreen]);

  // ── 인터랙션 ──────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
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
      gesture.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startScale: transform.scale,
        moved: true,
        lastX: (pts[0].x + pts[1].x) / 2,
        lastY: (pts[0].y + pts[1].y) / 2,
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
      setTransform((t) => {
        if (!t) return t;
        const ns = Math.min(6, Math.max(0.3, g.startScale * factor));
        const k = ns / t.scale;
        return { scale: ns, ox: midX - (midX - t.ox) * k, oy: midY - (midY - t.oy) * k };
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
        if (id) onStationClick(id);
      }
    }
    if (pointers.current.size === 0) gesture.current = null;
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

  // ── 툴팁 ─────────────────────────────────────────────────
  const hoveredStation = hovered ? STATION_BY_ID[hovered] : null;
  const hoveredCap = hovered ? highlights.capturable.get(hovered) : undefined;

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
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1.35)} aria-label="확대">+</button>
        <button onClick={() => zoomBy(1 / 1.35)} aria-label="축소">−</button>
        <button onClick={() => setTransform(fitTransform(size.w, size.h))} aria-label="전체 보기">⊙</button>
      </div>
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
                {l}
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
          {hoveredCap && (
            <div className="tooltip-cost">
              점령 비용 {hoveredCap.cost}AP
              {hoveredCap.viaRiver && ' (한강 도하 ×1.5)'}
              {hoveredCap.enemyOwned && ' — 적 점령지'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
