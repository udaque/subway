import { useState } from 'react';
import type { VictoryMode } from '../game/types';
import { RULES } from '../game/engine';
import { DIFFICULTY_LABEL, type Difficulty } from '../game/ai';

export type Opponent = 'ai' | 'local' | 'online-host' | 'online-guest';

export interface GameConfig {
  mode: VictoryMode;
  turnLimit: number;
  opponent: Opponent;
  difficulty: Difficulty;
  /** 온라인 방 인원 (2~4, 방장이 결정) */
  playerCount: number;
  /** 시작 배치: 직접 드래프트 or 10AP 랜덤 풀배정 */
  draftMode: 'manual' | 'random';
  joinCode?: string;
}

interface Props {
  onStart: (config: GameConfig) => void;
}

export default function SetupScreen({ onStart }: Props) {
  const [mode, setMode] = useState<VictoryMode>('hq');
  const [turnLimit, setTurnLimit] = useState(RULES.defaultTurnLimit);
  const [opponentKind, setOpponentKind] = useState<'ai' | 'local' | 'online'>('ai');
  const [onlineRole, setOnlineRole] = useState<'host' | 'join'>('host');
  const [joinCode, setJoinCode] = useState('');
  const [playerCount, setPlayerCount] = useState(2);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [draftMode, setDraftMode] = useState<'manual' | 'random'>('random');

  const opponent: Opponent =
    opponentKind === 'online' ? (onlineRole === 'host' ? 'online-host' : 'online-guest') : opponentKind;
  const isGuest = opponent === 'online-guest';
  const startLabel =
    opponent === 'online-host' ? '방 만들기' : opponent === 'online-guest' ? '참가하기' : '게임 시작';
  const canStart = !isGuest || joinCode.trim().length >= 4;

  return (
    <div className="overlay">
      <div className="setup-card">
        <h1>
          지하철 <span className="accent">땅따먹기</span>
        </h1>
        <p className="setup-sub">수도권 전철 전 노선 · 턴제 영토전</p>

        <div className="section-label">상대</div>
        <div className="mode-grid mode-grid-3">
          <button
            className={`mode-card ${opponentKind === 'ai' ? 'selected' : ''}`}
            onClick={() => setOpponentKind('ai')}
          >
            <div className="mode-name">🤖 AI 대전</div>
            <div className="mode-desc">혼자서 AI를 상대로</div>
          </button>
          <button
            className={`mode-card ${opponentKind === 'online' ? 'selected' : ''}`}
            onClick={() => setOpponentKind('online')}
          >
            <div className="mode-name">🌐 온라인 대전</div>
            <div className="mode-desc">방 코드를 공유해 최대 4인 실시간 대전 (P2P, 서버 없음)</div>
          </button>
          <button
            className={`mode-card ${opponentKind === 'local' ? 'selected' : ''}`}
            onClick={() => setOpponentKind('local')}
          >
            <div className="mode-name">👥 2인 로컬</div>
            <div className="mode-desc">한 기기에서 번갈아</div>
          </button>
        </div>

        {opponentKind === 'ai' && (
          <div className="limit-row">
            <span>난이도</span>
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <button
                key={d}
                className={`chip ${difficulty === d ? 'selected' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        )}

        {opponentKind === 'online' && (
          <>
            <div className="limit-row">
              <button
                className={`chip ${onlineRole === 'host' ? 'selected' : ''}`}
                onClick={() => setOnlineRole('host')}
              >
                방 만들기
              </button>
              <button
                className={`chip ${onlineRole === 'join' ? 'selected' : ''}`}
                onClick={() => setOnlineRole('join')}
              >
                코드로 참가
              </button>
              {onlineRole === 'join' && (
                <input
                  className="code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="방 코드"
                  maxLength={8}
                  autoCapitalize="characters"
                />
              )}
            </div>
            {onlineRole === 'host' && (
              <div className="limit-row">
                <span>인원</span>
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    className={`chip ${playerCount === n ? 'selected' : ''}`}
                    onClick={() => setPlayerCount(n)}
                  >
                    {n}인
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {!isGuest && (
          <>
            <div className="section-label">시작 배치</div>
            <div className="mode-grid">
              <button
                className={`mode-card ${draftMode === 'random' ? 'selected' : ''}`}
                onClick={() => setDraftMode('random')}
              >
                <div className="mode-name">🎲 랜덤 배정</div>
                <div className="mode-desc">10AP를 꽉 채워 무작위 역 자동 배정 — 바로 시작</div>
              </button>
              <button
                className={`mode-card ${draftMode === 'manual' ? 'selected' : ''}`}
                onClick={() => setDraftMode('manual')}
              >
                <div className="mode-name">🎯 직접 선택</div>
                <div className="mode-desc">10AP로 시작 역들을 번갈아 드래프트</div>
              </button>
            </div>

            <div className="section-label">승리 조건</div>
            <div className="mode-grid mode-grid-3">
              <button
                className={`mode-card ${mode === 'hq' ? 'selected' : ''}`}
                onClick={() => setMode('hq')}
              >
                <div className="mode-name">🚩 본진 함락전</div>
                <div className="mode-desc">상대 본진 역을 점령하면 즉시 승리</div>
              </button>
              <button
                className={`mode-card ${mode === 'turnLimit' ? 'selected' : ''}`}
                onClick={() => setMode('turnLimit')}
              >
                <div className="mode-name">🗺️ 정복전</div>
                <div className="mode-desc">제한 라운드 후 더 많은 역을 가진 쪽이 승리</div>
              </button>
              <button
                className={`mode-card ${mode === 'annihilation' ? 'selected' : ''}`}
                onClick={() => setMode('annihilation')}
              >
                <div className="mode-name">⚔️ 전멸전</div>
                <div className="mode-desc">상대의 모든 역을 점령해야 승리 — 본진을 잃어도 게임은 계속된다</div>
              </button>
            </div>

            {mode === 'turnLimit' && (
              <div className="limit-row">
                <span>라운드 수</span>
                {[10, 20, 30, 50].map((n) => (
                  <button
                    key={n}
                    className={`chip ${turnLimit === n ? 'selected' : ''}`}
                    onClick={() => setTurnLimit(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {isGuest && (
          <p className="guest-hint">승리 조건은 방장이 정한 설정을 따릅니다.</p>
        )}

        <button
          className="btn-start"
          disabled={!canStart}
          onClick={() =>
            onStart({
              mode,
              turnLimit,
              opponent,
              difficulty,
              playerCount: opponent === 'online-host' ? playerCount : 2,
              draftMode,
              joinCode: joinCode.trim(),
            })
          }
        >
          {startLabel}
        </button>

        <div className="rules-hint">
          <p>
            시작 시 10AP로 시작 역들을 드래프트하고, 이후 턴마다 점령한 역들이
            AP를 생산합니다. AP로 인접 역을 점령하세요.
          </p>
          <ul>
            <li>🚩 드래프트: 역당 1AP — 환승역은 노선 수만큼 가산(2노선 +1, 3노선 +2…), 떨어진 지역 +1. 첫 역이 본진, 남은 AP는 이월</li>
            <li>💰 점령 비용 = 기본 2 + 방어력 (적 점령지 +1)</li>
            <li>⚔️ 포위: 적 역이 내 역 2곳과 인접하면 반값(내림), 3곳 이상이면 무료</li>
            <li>🛠 내 역을 선택하면 요새화(방어 +1, 최대 +2)·바리케이드(구간 공격 +3) 설치 가능</li>
            <li>📉 수확 체감: 수입이 커질수록 실수령 비율이 줄어듭니다</li>
            <li>🏙️ 도심·환승역은 생산량이 높고, 변두리 역은 낮습니다</li>
            <li>🛡️ 지상역(점선)은 방어 0, 지하역 1, 심층역(두꺼운 테두리) 2</li>
            <li>🌊 한강을 건너는 공격은 비용이 1.5배입니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
