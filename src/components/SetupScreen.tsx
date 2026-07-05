import { useState } from 'react';
import type { VictoryMode } from '../game/types';
import { RULES } from '../game/engine';
import { DIFFICULTY_LABEL, type Difficulty } from '../game/ai';

export interface GameConfig {
  mode: VictoryMode;
  turnLimit: number;
  vsAi: boolean;
  difficulty: Difficulty;
}

interface Props {
  onStart: (config: GameConfig) => void;
}

export default function SetupScreen({ onStart }: Props) {
  const [mode, setMode] = useState<VictoryMode>('hq');
  const [turnLimit, setTurnLimit] = useState(RULES.defaultTurnLimit);
  const [vsAi, setVsAi] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <div className="overlay">
      <div className="setup-card">
        <h1>
          지하철 <span className="accent">땅따먹기</span>
        </h1>
        <p className="setup-sub">수도권 전철 전 노선 · 턴제 영토전</p>

        <div className="section-label">상대</div>
        <div className="mode-grid">
          <button
            className={`mode-card ${vsAi ? 'selected' : ''}`}
            onClick={() => setVsAi(true)}
          >
            <div className="mode-name">🤖 AI 대전</div>
            <div className="mode-desc">혼자서 AI를 상대로 플레이</div>
          </button>
          <button
            className={`mode-card ${!vsAi ? 'selected' : ''}`}
            onClick={() => setVsAi(false)}
          >
            <div className="mode-name">👥 2인 로컬</div>
            <div className="mode-desc">한 기기에서 번갈아 플레이</div>
          </button>
        </div>

        {vsAi && (
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

        <div className="section-label">승리 조건</div>
        <div className="mode-grid">
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

        <button
          className="btn-start"
          onClick={() => onStart({ mode, turnLimit, vsAi, difficulty })}
        >
          게임 시작
        </button>

        <div className="rules-hint">
          <p>턴마다 점령한 역들이 AP를 생산하고, AP로 인접 역을 점령합니다.</p>
          <ul>
            <li>💰 점령 비용 = 기본 2 + 방어력 (적 점령지 +1)</li>
            <li>🏙️ 도심·환승역은 생산량이 높고, 변두리 역은 낮습니다</li>
            <li>🛡️ 지상역(점선)은 방어 0, 지하역 1, 심층역(두꺼운 테두리) 2</li>
            <li>🌊 한강을 건너는 공격은 비용이 1.5배입니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
