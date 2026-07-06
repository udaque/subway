import titleImg from '../assets/title.webp';

interface Props {
  onPlay: () => void;
  onTutorial: () => void;
  onChallenges: () => void;
}

export default function LandingScreen({ onPlay, onTutorial, onChallenges }: Props) {
  return (
    <div className="overlay">
      <div className="setup-card landing-card">
        <img className="title-img" src={titleImg} alt="이번 역은 적진입니다" />
        <button className="btn-start btn-landing" onClick={onPlay}>
          🚇 게임 시작
        </button>
        <button className="btn-start btn-landing btn-landing-sub" onClick={onTutorial}>
          🎓 튜토리얼
        </button>
        <button className="btn-start btn-landing btn-landing-sub" onClick={onChallenges}>
          🏆 챌린지
        </button>
        <div className="setup-footer">{__APP_VERSION__} — made by Teeum Soft</div>
      </div>
    </div>
  );
}
