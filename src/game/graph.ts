import { EDGES } from '../data/stations';
import type { Edge } from './types';

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
