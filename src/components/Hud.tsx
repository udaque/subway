import type { GameState, PlayerId } from '../game/types';
import { apCap, effectiveIncome, ownedStations } from '../game/engine';
import { PLAYER_COLORS } from './MapCanvas';

interface Props {
  state: GameState;
  playerLabels: string[];
  lockReason: 'ai' | 'remote' | null;
  notice: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onEndTurn: () => void;
  onDraftDone: () => void;
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
  const out = state.eliminated[player];
  const owned = ownedStations(state, player).length;
  const income = effectiveIncome(state, player);
  return (
    <div
      className={`player-card ${active ? 'active' : ''} ${out ? 'eliminated' : ''}`}
      style={{ borderColor: active ? PLAYER_COLORS[player] : 'transparent' }}
    >
      <span className="player-dot" style={{ background: PLAYER_COLORS[player] }} />
      <span className="player-name">{label}</span>
      {out ? (
        <span className="player-stat">탈락</span>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

export default function Hud({
  state,
  playerLabels,
  lockReason,
  notice,
  muted,
  onToggleMute,
  onEndTurn,
  onDraftDone,
  onRestart,
}: Props) {
  const banner = (() => {
    if (notice) return notice;
    if (state.phase === 'draft') {
      if (lockReason === 'ai') return '🤖 AI가 시작 역을 고르는 중…';
      if (lockReason === 'remote') return '🌐 상대가 시작 역을 고르는 중…';
      return `${playerLabels[state.current]}: AP로 시작 역들을 고르세요 — 첫 역이 본진, 남은 AP는 게임에서 사용`;
    }
    if (state.phase === 'over') {
      return state.winner === 'draw'
        ? '무승부!'
        : `${playerLabels[state.winner as number]} 승리!`;
    }
    if (lockReason === 'ai') return '🤖 AI 턴 진행 중…';
    if (lockReason === 'remote') return '🌐 상대 턴 진행 중…';
    return null;
  })();

  return (
    <>
      <header className="hud">
        <div className="hud-title">
          지하철 <span className="accent">땅따먹기</span>
        </div>
        <div className="hud-players">
          {playerLabels.slice(0, state.playerCount).map((label, p) =>
            p === 1 ? (
              // 라운드 카운터는 첫 두 카드 사이에
              [
                <div className="hud-round" key="round">
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
                </div>,
                <PlayerCard state={state} player={p} label={label} key={p} />,
              ]
            ) : (
              <PlayerCard state={state} player={p} label={label} key={p} />
            ),
          )}
        </div>
        <div
          className="hud-actions"
          data-round={
            state.mode === 'turnLimit'
              ? `${Math.min(state.round, state.turnLimit)}/${state.turnLimit}R`
              : `${state.round}R`
          }
        >
          {state.phase === 'draft' && (
            <button
              className="btn-end-turn"
              style={{ background: PLAYER_COLORS[state.current] }}
              disabled={lockReason !== null}
              onClick={onDraftDone}
            >
              선택 완료
            </button>
          )}
          {state.phase === 'playing' && (
            <button
              className="btn-end-turn"
              style={{ background: PLAYER_COLORS[state.current] }}
              disabled={lockReason !== null}
              onClick={onEndTurn}
            >
              턴 종료
            </button>
          )}
          <button className="btn-ghost btn-mute" onClick={onToggleMute} aria-label="효과음">
            {muted ? '🔇' : '🔊'}
          </button>
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
