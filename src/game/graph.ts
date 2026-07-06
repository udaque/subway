import { EDGES, EXPRESS_STOPS, LINE_SEQUENCES } from '../data/stations';
import type { Edge, LineId } from './types';

/** 역 id → 인접 엣지 목록 */
export const ADJACENCY: Record<string, Edge[]> = (() => {
  const adj: Record<string, Edge[]> = {};
  for (const e of EDGES) {
    (adj[e.a] ??= []).push(e);
    (adj[e.b] ??= []).push(e);
  }
  return adj;
})();

export function neighbors(id: string): string[] {
  return (ADJACENCY[id] ?? []).map((e) => (e.a === id ? e.b : e.a));
}

/** 두 역을 잇는 엣지들 (환승역 쌍이면 복수 가능) */
export function edgesBetween(a: string, b: string): Edge[] {
  return (ADJACENCY[a] ?? []).filter((e) => e.a === b || e.b === b);
}

/**
 * 급행 점프 인접 (역 → 상대편 급행역들).
 * 같은 노선의 연속한 급행 정차역 쌍 중 물리적으로 인접하지 않은 것만.
 * river = 사이 구간에 도하 엣지가 포함되는지 (도하 할증 동일 적용).
 */
export const EXPRESS_ADJ: Record<string, Array<{ to: string; river: boolean }>> = (() => {
  const adj: Record<string, Array<{ to: string; river: boolean }>> = {};
  for (const [line, stops] of Object.entries(EXPRESS_STOPS) as Array<[LineId, string[]]>) {
    const seq = LINE_SEQUENCES[line][0];
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      const ia = seq.indexOf(a);
      const ib = seq.indexOf(b);
      if (ia < 0 || ib < 0 || Math.abs(ia - ib) <= 1) continue;
      let river = false;
      for (let k = Math.min(ia, ib); k < Math.max(ia, ib); k++) {
        if (edgesBetween(seq[k], seq[k + 1]).some((e) => e.river)) {
          river = true;
          break;
        }
      }
      (adj[a] ??= []).push({ to: b, river });
      (adj[b] ??= []).push({ to: a, river });
    }
  }
  return adj;
})();

/** BFS 최단 거리 (엣지 수 기준) */
export function graphDistance(from: string, to: string): number {
  if (from === to) return 0;
  const visited = new Set([from]);
  let frontier = [from];
  let dist = 0;
  while (frontier.length > 0) {
    dist++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighbors(id)) {
        if (visited.has(n)) continue;
        if (n === to) return dist;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return Infinity;
}
