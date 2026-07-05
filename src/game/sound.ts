/**
 * 효과음 — 외부 오디오 파일 없이 Web Audio API로 합성.
 * 브라우저 자동재생 정책: 첫 사용자 제스처에서 AudioContext를 깨운다.
 */

const MUTE_KEY = 'subway-muted';

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  /* localStorage 접근 불가 환경 무시 */
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* 무시 */
  }
}

function ac(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// 첫 제스처에서 컨텍스트를 깨워 이후 AI/원격 행동 소리도 나게 한다
if (typeof window !== 'undefined') {
  const wake = () => {
    ac();
    window.removeEventListener('pointerdown', wake);
  };
  window.addEventListener('pointerdown', wake, { once: true });
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  when?: number;
  slideTo?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}): void {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const { type = 'sine', gain = 0.12, when = 0, slideTo } = opts;
  const t0 = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** 드래프트에서 역 선택 */
  draft(): void {
    tone(660, 0.08, { type: 'triangle', slideTo: 880 });
  },
  /** 중립 역 점령 */
  capture(): void {
    tone(520, 0.07, { gain: 0.1 });
    tone(780, 0.11, { when: 0.05 });
  },
  /** 내가 적 역을 탈취 */
  captureEnemy(): void {
    tone(392, 0.09, { type: 'square', gain: 0.06 });
    tone(587, 0.09, { when: 0.06, gain: 0.11 });
    tone(880, 0.14, { when: 0.12 });
  },
  /** 내 역을 빼앗김 */
  lost(): void {
    tone(494, 0.1, { type: 'sawtooth', gain: 0.055 });
    tone(247, 0.22, { when: 0.08, type: 'sawtooth', gain: 0.07 });
  },
  /** 턴 전환 */
  turn(): void {
    tone(840, 0.06, { gain: 0.05 });
  },
  /** 승리 */
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.17, { when: i * 0.12, gain: 0.13 }));
  },
  /** 패배 */
  lose(): void {
    [494, 415, 349, 262].forEach((f, i) =>
      tone(f, 0.2, { when: i * 0.14, type: 'triangle', gain: 0.1 }),
    );
  },
};
