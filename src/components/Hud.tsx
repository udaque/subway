import type { GameState, PlayerId } from '../game/types';
import { apCap, ownedStations, playerIncome } from '../game/engine';
import { PLAYER_COLORS } from './MapCanvas';

interface Props {
  state: GameState;
  playerLabels: [string, string];
  aiThinking: boolean;
  onEndTurn: () => void;
  onRestart: () => void;
}

function PlayerCard({
  state,
  player,
  label,
}: {
  state: GameState;
  player: PlayerId;
  label: string;
}) {
  const active = state.current === player && state.phase !== 'over';
  const owned = ownedStations(state, player).length;
  const income = playerIncome(state, player);
  return (
    <div
      className={`player-card ${active ? 'active' : ''}`}
      style={{ borderColor: active ? PLAYER_COLORS[player] : 'transparent' }}
    >
      <span className="player-dot" style={{ background: PLAYER_COLORS[player] }} />
      <span className="player-name">{label}</span>
      <span className="player-stat">
        <b>{state.ap[player]}</b>
        <small>/{apCap(state, player)} AP</small>
      </span>
      <span className="player-stat">
        <b>{owned}</b>
        <small>역</small>
      </span>
      <span className="player-stat">
        <b>+{income}</b>
        <small>/턴</small>
      </span>
    </div>
  );
}

export default function Hud({ state, playerLabels, aiThinking, onEndTurn, onRestart }: Props) {
  const banner = (() => {
    if (state.phase === 'pickHQ') {
      return `${playerLabels[state.current]}: 본진으로 삼을 역을 선택하세요 (상대 본진에서 6정거장 이상)`;
    }
    if (state.phase === 'over') {
      return state.winner === 'draw'
        ? '무승부!'
        : `${playerLabels[state.winner as number]} 승리!`;
    }
    if (aiThinking) {
      return '🤖 AI 턴 진행 중…';
    }
    return null;
  })();

  return (
    <>
      <header className="hud">
        <div className="hud-title">
          지하철 <span className="accent">땅따먹기</span>
        </div>
        <div className="hud-players">
          <PlayerCard state={state} player={0} label={playerLabels[0]} />
          <div className="hud-round">
            {state.mode === 'turnLimit' ? (
              <>
                <b>{Math.min(state.round, state.turnLimit)}</b>
                <small>/{state.turnLimit}R</small>
              </>
            ) : (
              <>
                <b>{state.round}</b>
                <small>R</small>
              </>
            )}
          </div>
          <PlayerCard state={state} player={1} label={playerLabels[1]} />
        </div>
        <div className="hud-actions">
          {state.phase === 'playing' && (
            <button
              className="btn-end-turn"
              style={{ background: PLAYER_COLORS[state.current] }}
              disabled={aiThinking}
              onClick={onEndTurn}
            >
              턴 종료
            </button>
          )}
          <button className="btn-ghost" onClick={onRestart}>
            새 게임
          </button>
        </div>
      </header>
      {banner && (
        <div
          className="banner"
          style={{
            borderColor:
              state.phase === 'over'
                ? '#ffd166'
                : PLAYER_COLORS[state.current],
          }}
        >
          {banner}
        </div>
      )}
    </>
  );
}
