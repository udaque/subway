import { useEffect, useMemo, useState } from 'react';
import MapCanvas, { PLAYER_COLORS } from './components/MapCanvas';
import type { MapHighlights } from './components/MapCanvas';
import Hud from './components/Hud';
import SetupScreen, { type GameConfig } from './components/SetupScreen';
import {
  applyAction,
  canDraftPick,
  capturableStations,
  createGame,
  ownedStations,
} from './game/engine';
import { aiDraftAction, aiNextAction, DIFFICULTY_LABEL } from './game/ai';
import { STATIONS } from './data/stations';
import type { GameState } from './game/types';
import './App.css';

const AI_MOVE_DELAY = 500;
const AI_PICK_DELAY = 800;

export default function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [state, setState] = useState<GameState | null>(null);

  const isAiTurn =
    config?.vsAi === true && state !== null && state.phase !== 'over' && state.current === 1;

  // AI 턴 자동 진행 (행동 사이 딜레이를 둬서 진행이 보이게)
  useEffect(() => {
    if (!isAiTurn || !state || !config) return;
    const delay = state.phase === 'draft' ? AI_PICK_DELAY : AI_MOVE_DELAY;
    const timer = setTimeout(() => {
      setState((s) => {
        if (!s || s.phase === 'over' || s.current !== 1) return s;
        if (s.phase === 'draft') {
          return applyAction(s, aiDraftAction(s, config.difficulty));
        }
        return applyAction(s, aiNextAction(s, config.difficulty));
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [isAiTurn, state, config]);

  const highlights: MapHighlights = useMemo(() => {
    if (!state || isAiTurn) return { capturable: new Map(), pickable: null };
    if (state.phase === 'draft') {
      return {
        capturable: new Map(),
        pickable: new Set(STATIONS.filter((s) => canDraftPick(state, s.id)).map((s) => s.id)),
      };
    }
    if (state.phase === 'playing') {
      return { capturable: capturableStations(state), pickable: null };
    }
    return { capturable: new Map(), pickable: null };
  }, [state, isAiTurn]);

  if (!state || !config) {
    return (
      <SetupScreen
        onStart={(cfg: GameConfig) => {
          setConfig(cfg);
          setState(createGame(cfg.mode, cfg.turnLimit));
        }}
      />
    );
  }

  const playerLabels: [string, string] = [
    config.vsAi ? '나' : 'P1',
    config.vsAi ? `AI·${DIFFICULTY_LABEL[config.difficulty]}` : 'P2',
  ];

  const onStationClick = (id: string) => {
    if (isAiTurn) return;
    setState((s) => {
      if (!s) return s;
      if (s.phase === 'draft') return applyAction(s, { type: 'draftPick', station: id });
      if (s.phase === 'playing') return applyAction(s, { type: 'capture', station: id });
      return s;
    });
  };

  const restart = () => {
    setState(null);
    setConfig(null);
  };

  return (
    <div className="app">
      <Hud
        state={state}
        playerLabels={playerLabels}
        aiThinking={isAiTurn}
        onEndTurn={() => {
          if (isAiTurn) return;
          setState((s) => (s ? applyAction(s, { type: 'endTurn' }) : s));
        }}
        onDraftDone={() => {
          if (isAiTurn) return;
          setState((s) => (s ? applyAction(s, { type: 'draftDone' }) : s));
        }}
        onRestart={restart}
      />
      <MapCanvas state={state} highlights={highlights} onStationClick={onStationClick} />
      {state.phase === 'over' && (
        <div className="overlay">
          <div className="setup-card result-card">
            <h1>
              {state.winner === 'draw' ? (
                '무승부'
              ) : (
                <span style={{ color: PLAYER_COLORS[state.winner as 0 | 1] }}>
                  {playerLabels[state.winner as 0 | 1]} 승리!
                </span>
              )}
            </h1>
            <p className="setup-sub">
              {playerLabels[0]} {ownedStations(state, 0).length}역 · {playerLabels[1]}{' '}
              {ownedStations(state, 1).length}역 · {state.round - 1}라운드 진행
            </p>
            <button className="btn-start" onClick={restart}>
              새 게임
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
