import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Room } from 'trystero';
import MapCanvas, { PLAYER_COLORS } from './components/MapCanvas';
import type { MapEffect, MapHighlights } from './components/MapCanvas';
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
import { isMuted, setMuted, sfx } from './game/sound';
import { STATIONS, STATION_BY_ID } from './data/stations';
import type { Action, GameState, PlayerId, VictoryMode } from './game/types';
import './App.css';

const AI_MOVE_DELAY = 650;
const AI_PICK_DELAY = 800;
const APP_ID = 'udaque-subway-territory';

interface NetState {
  role: 'host' | 'guest';
  code: string;
  status: 'waiting' | 'connected' | 'peer-left';
  /** 내 플레이어 인덱스 (host = 0, guest는 start 메시지로 배정) */
  seat: number;
  /** 총 인원 / 현재 모인 인원 (대기 화면용) */
  playerCount: number;
  joined: number;
}

function genRoomCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [effects, setEffects] = useState<MapEffect[]>([]);
  const [focus, setFocus] = useState<{ x: number; y: number; seq: number } | null>(null);
  const [net, setNet] = useState<NetState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted());

  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;
  const netRef = useRef<NetState | null>(null);
  netRef.current = net;
  const configRef = useRef<GameConfig | null>(null);
  configRef.current = config;
  const roomRef = useRef<Room | null>(null);
  const sendActRef = useRef<((a: Action) => void) | null>(null);
  const fxIdRef = useRef(0);
  const focusSeqRef = useRef(0);

  const isAi = config?.opponent === 'ai';
  const myPlayer: PlayerId | null = net ? net.seat : null;

  /**
   * 모든 상태 전이의 단일 통로.
   * auto = 화면 밖 주체(AI/원격 상대)의 행동 → 카메라가 그 위치로 이동.
   */
  const dispatch = useCallback(
    (action: Action, opts: { auto?: boolean; fromRemote?: boolean } = {}) => {
      const s = stateRef.current;
      if (!s) return;
      const next = applyAction(s, action);
      if (next === s) return;

      // 이 화면의 시점 플레이어 (로컬 2인은 null = 중립 시점)
      const cfg = configRef.current;
      const viewer: PlayerId | null =
        cfg?.opponent === 'ai' ? 0 : netRef.current ? netRef.current.seat : null;

      if (action.type === 'capture' || action.type === 'draftPick') {
        const st = STATION_BY_ID[action.station];
        const prevOwner = s.owners[action.station] ?? null;
        const now = performance.now();
        setEffects((list) => [
          ...list.filter((f) => now - f.start < 900),
          {
            id: ++fxIdRef.current,
            x: st.x,
            y: st.y,
            color: PLAYER_COLORS[s.current],
            big: prevOwner !== null, // 플레이어 소유지가 넘어감 → 강한 효과
            start: now,
          },
        ]);
        if (opts.auto) {
          setFocus({ x: st.x, y: st.y, seq: ++focusSeqRef.current });
        }
        // 효과음
        if (action.type === 'draftPick') sfx.draft();
        else if (prevOwner === null) sfx.capture();
        else if (viewer !== null && prevOwner === viewer) sfx.lost();
        else sfx.captureEnemy();
      } else if (action.type === 'endTurn') {
        sfx.turn();
      }

      if (next.phase === 'over' && next.winner !== null) {
        if (next.winner === 'draw' || viewer === null || next.winner === viewer) sfx.win();
        else sfx.lose();
      }

      setState(next);
      if (!opts.fromRemote && netRef.current?.status === 'connected') {
        sendActRef.current?.(action);
      }
    },
    [],
  );

  // ── AI 턴 자동 진행 ────────────────────────────────────────
  const isAiTurn = isAi && state !== null && state.phase !== 'over' && state.current === 1;
  useEffect(() => {
    if (!isAiTurn || !state || !config) return;
    const delay = state.phase === 'draft' ? AI_PICK_DELAY : AI_MOVE_DELAY;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (!s || s.phase === 'over' || s.current !== 1) return;
      const action =
        s.phase === 'draft'
          ? aiDraftAction(s, config.difficulty)
          : aiNextAction(s, config.difficulty);
      dispatch(action, { auto: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [isAiTurn, state, config, dispatch]);

  // ── 온라인 방 생성/참가 ────────────────────────────────────
  const beginOnline = useCallback(
    async (cfg: GameConfig) => {
      const isHost = cfg.opponent === 'online-host';
      const code = isHost ? genRoomCode() : (cfg.joinCode ?? '').trim().toUpperCase();
      if (!code) return;
      // P2P 라이브러리는 온라인 모드에서만 동적 로드 (기본 번들 경량화)
      const { joinRoom, selfId } = await import('trystero');
      const room = joinRoom({ appId: APP_ID }, code);
      roomRef.current = room;
      const act = room.makeAction<Action>('act');
      const start = room.makeAction<{
        mode: VictoryMode;
        turnLimit: number;
        playerCount: number;
        seats: Record<string, number>;
      }>('start');
      sendActRef.current = (a) => {
        void act.send(a);
      };
      act.onMessage = (a) => dispatch(a, { auto: true, fromRemote: true });
      setConfig(cfg);
      setNet({
        role: isHost ? 'host' : 'guest',
        code,
        status: 'waiting',
        seat: 0,
        playerCount: isHost ? cfg.playerCount : 0,
        joined: 1,
      });

      if (isHost) {
        // 참가 순서대로 좌석 배정 (host = 0)
        const peerSeats: string[] = [];
        room.onPeerJoin = (peerId: string) => {
          if (stateRef.current) return; // 시작 후 참가자는 무시
          if (!peerSeats.includes(peerId)) peerSeats.push(peerId);
          const joined = 1 + peerSeats.length;
          setNet((n) => (n ? { ...n, joined } : n));
          if (joined >= cfg.playerCount) {
            const seats: Record<string, number> = {};
            peerSeats.slice(0, cfg.playerCount - 1).forEach((id, i) => {
              seats[id] = i + 1;
            });
            void start.send({
              mode: cfg.mode,
              turnLimit: cfg.turnLimit,
              playerCount: cfg.playerCount,
              seats,
            });
            setNet((n) => (n ? { ...n, status: 'connected' } : n));
            setState(createGame(cfg.mode, cfg.turnLimit, cfg.playerCount));
          }
        };
      } else {
        start.onMessage = ({ mode, turnLimit, playerCount, seats }) => {
          if (stateRef.current) return;
          const seat = seats[selfId];
          if (seat === undefined) return; // 정원 초과 — 좌석 없음
          setNet((n) =>
            n ? { ...n, status: 'connected', seat, playerCount, joined: playerCount } : n,
          );
          setConfig((c) => (c ? { ...c, mode, turnLimit, playerCount } : c));
          setState(createGame(mode, turnLimit, playerCount));
        };
      }
      room.onPeerLeave = () => {
        setNet((n) => (n ? { ...n, status: 'peer-left' } : n));
      };
    },
    [dispatch],
  );

  const restart = useCallback(() => {
    void roomRef.current?.leave();
    roomRef.current = null;
    sendActRef.current = null;
    setNet(null);
    setState(null);
    setConfig(null);
    setEffects([]);
    setFocus(null);
    setSelected(null);
  }, []);

  // 원격 상대 턴 여부
  const isRemoteTurn =
    net !== null &&
    state !== null &&
    state.phase !== 'over' &&
    (net.status !== 'connected' || state.current !== myPlayer);

  const lockReason: 'ai' | 'remote' | null = isAiTurn ? 'ai' : isRemoteTurn ? 'remote' : null;

  const highlights: MapHighlights = useMemo(() => {
    if (!state || lockReason) return { capturable: new Map(), pickable: null };
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
  }, [state, lockReason]);

  if (!state || !config) {
    // 온라인 대기 중 (상대를 기다리는 화면)
    if (net && config) {
      return (
        <div className="overlay">
          <div className="setup-card">
            <h1>
              {net.role === 'host' ? '상대 대기 중' : '방 연결 중'}
              <span className="accent">…</span>
            </h1>
            {net.role === 'host' ? (
              <>
                <p className="setup-sub">
                  아래 방 코드를 상대에게 알려주세요 · 참가 {net.joined}/{net.playerCount}명
                </p>
                <div className="room-code">{net.code}</div>
              </>
            ) : (
              <p className="setup-sub">
                방 <b>{net.code}</b>에 연결하고 있어요. 방장이 자리를 지키고 있어야 합니다.
              </p>
            )}
            <button className="btn-ghost btn-cancel" onClick={restart}>
              취소
            </button>
          </div>
        </div>
      );
    }
    return (
      <SetupScreen
        onStart={(cfg: GameConfig) => {
          if (cfg.opponent === 'online-host' || cfg.opponent === 'online-guest') {
            void beginOnline(cfg);
          } else {
            setConfig(cfg);
            setState(createGame(cfg.mode, cfg.turnLimit));
          }
        }}
      />
    );
  }

  const playerLabels: string[] = isAi
    ? ['나', `AI·${DIFFICULTY_LABEL[config.difficulty]}`]
    : net
      ? Array.from({ length: state.playerCount }, (_, i) => (i === net.seat ? '나' : `P${i + 1}`))
      : ['P1', 'P2'];

  const notice =
    net?.status === 'peer-left' ? '🔌 상대와의 연결이 끊어졌습니다 — 새 게임으로 나가세요' : null;

  const onConfirm = (id: string) => {
    if (lockReason) return;
    const s = stateRef.current;
    if (!s) return;
    if (s.phase === 'draft') dispatch({ type: 'draftPick', station: id });
    else if (s.phase === 'playing') dispatch({ type: 'capture', station: id });
    setSelected(null);
  };

  return (
    <div className="app">
      <Hud
        state={state}
        playerLabels={playerLabels}
        lockReason={lockReason}
        notice={notice}
        muted={muted}
        onToggleMute={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
        onEndTurn={() => {
          if (!lockReason) dispatch({ type: 'endTurn' });
        }}
        onDraftDone={() => {
          if (!lockReason) dispatch({ type: 'draftDone' });
        }}
        onRestart={restart}
      />
      <MapCanvas
        state={state}
        highlights={highlights}
        effects={effects}
        focus={focus}
        selected={selected}
        locked={lockReason !== null}
        onSelect={setSelected}
        onConfirm={onConfirm}
      />
      {state.phase === 'over' && (
        <div className="overlay">
          <div className="setup-card result-card">
            <h1>
              {state.winner === 'draw' ? (
                '무승부'
              ) : (
                <span style={{ color: PLAYER_COLORS[state.winner as number] }}>
                  {playerLabels[state.winner as number]} 승리!
                </span>
              )}
            </h1>
            <p className="setup-sub">
              {playerLabels
                .slice(0, state.playerCount)
                .map((l, i) => `${l} ${ownedStations(state, i).length}역`)
                .join(' · ')}{' '}
              · {state.round - 1}라운드 진행
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
