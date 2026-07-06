import { useMemo, useState } from 'react';
import {
  ACHIEVEMENTS,
  TIER_ICON,
  TIER_LABEL,
  TIER_ORDER,
  unlockedMap,
} from '../game/achievements';

interface Props {
  onExit: () => void;
}

export default function ChallengeScreen({ onExit }: Props) {
  const unlocked = useMemo(() => unlockedMap(), []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const doneCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;

  return (
    <div className="overlay">
      <div className="setup-card challenge-card">
        <div className="tut-head">
          <h1>
            챌린지 <span className="accent">{doneCount}</span>/{ACHIEVEMENTS.length}
          </h1>
          <button className="btn-ghost tut-exit" onClick={onExit}>
            나가기
          </button>
        </div>
        <div className="challenge-list">
          {TIER_ORDER.map((tier) => (
            <div key={tier}>
              <div className="challenge-tier">
                {TIER_ICON[tier]} {TIER_LABEL[tier]}
              </div>
              {ACHIEVEMENTS.filter((a) => a.tier === tier).map((a) => {
                const done = Boolean(unlocked[a.id]);
                const open = expanded === a.id;
                return (
                  <button
                    key={a.id}
                    className={`challenge-item${done ? ' done' : ''}`}
                    onClick={() => setExpanded(open ? null : a.id)}
                  >
                    <div className="challenge-title">
                      <span className="challenge-check">{done ? '✅' : '🔒'}</span>
                      {a.title}
                    </div>
                    {open && <div className="challenge-cond">{a.desc}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
