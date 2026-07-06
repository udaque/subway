import { captureInfo } from './engine';
import { STATION_BY_ID } from '../data/stations';
import type { GameState, PlayerId } from './types';

/**
 * D1 안내방송 — 실제 지하철 방송을 패러디한 이벤트 멘트.
 * 게임 로직과 무관한 순수 연출이라 Math.random을 써도 동기화가 깨지지 않는다.
 *
 * 빈도 정책: 큰 사건(적 역 탈취·피탈·포위 무혈입성·본진 함락·승패·개전)은 매번,
 * 중립 역 점령은 10회에 1번꼴 랜덤. 요새화/바리케이드는 본인 조작이라 생략.
 */

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const NEUTRAL_CHANCE = 0.1;

export function startAnnouncement(state: GameState, viewer: PlayerId | null): string {
  const hqId = state.hq[viewer ?? 0];
  const hq = hqId ? STATION_BY_ID[hqId]?.name : null;
  return hq
    ? `본 열차는 ${hq}발 적진행 열차입니다. 출입문 닫습니다.`
    : '본 열차는 적진행 열차입니다. 출입문 닫습니다.';
}

export function endAnnouncement(state: GameState, viewer: PlayerId | null): string {
  if (state.winner === 'draw') {
    return '금일 운행이 종료되었습니다. 승부는 다음 열차에서 가리겠습니다.';
  }
  if (viewer === null || state.winner === viewer) {
    return '이 열차의 종착역입니다. 오늘도 우리 노선을 이용해 주셔서 감사합니다.';
  }
  return '운행이 종료되었습니다. 막차 시간을 확인하시기 바랍니다.';
}

/**
 * capture 액션 하나에 대한 방송 멘트. 조용히 넘어갈 이벤트면 null.
 * prev = 액션 적용 전 상태 (점령 비용/이전 소유주 판단에 필요).
 */
export function captureAnnouncement(
  prev: GameState,
  station: string,
  viewer: PlayerId | null,
): string | null {
  const name = STATION_BY_ID[station]?.name ?? station;
  const actor = prev.current;
  const prevOwner = prev.owners[station] ?? null;
  const isHqFall = prevOwner !== null && prev.hq[prevOwner] === station;
  const mine = viewer === null || actor === viewer;

  // 본진 함락은 누구의 일이든 방송한다
  if (isHqFall) {
    if (viewer !== null && prevOwner === viewer) {
      return `${name}역… 우리 열차의 종착역입니다. 모두 하차하시기 바랍니다.`;
    }
    return `${name}역, 종착역입니다. 두고 내리는 진영이 없는지 다시 한번 확인하시기 바랍니다.`;
  }

  // 내 역 피탈 경고
  if (viewer !== null && prevOwner === viewer) {
    return pick([
      `안내 말씀 드립니다. ${name}역이 적 노선으로 전환되었습니다.`,
      `${name}역 무정차 통과합니다. 현재 해당 역은 적 관할입니다.`,
    ]);
  }

  // 제3자끼리의 다툼이나 적의 중립 점령은 조용히
  if (!mine) return null;

  const info = captureInfo(prev, station);

  // 포위 무혈입성
  if (info && info.cost === 0) {
    return `${name}역, 사방이 막혀 무혈입성했습니다. 편안한 여행 되십시오.`;
  }

  // 적 역 탈취
  if (prevOwner !== null) {
    return pick([
      `이번 역은 적진이었습니다. ${name}역, 지금부터 우리 관할입니다.`,
      `${name}역을 접수했습니다. 타는 곳이 변경되오니 참고하시기 바랍니다.`,
    ]);
  }

  // 도하 점령
  if (info?.viaRiver) {
    return `우리 열차는 한강을 건너 ${name}역에 도착했습니다.`;
  }

  // 중립 점령 — 매번 나오면 시끄러우니 가끔만
  if (Math.random() < NEUTRAL_CHANCE) {
    return pick([
      `이번 역은 ${name}, ${name}역입니다. 내리실 문은… 이제 우리 쪽입니다.`,
      `${name}역, 금일부로 우리 노선에 편입되었습니다.`,
    ]);
  }
  return null;
}
