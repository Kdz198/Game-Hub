'use client';
import { useEffect, useRef, useState } from 'react';
import { StackBallGame, BallSkin } from '@/core/games/stack-ball/StackBallGame';
import styles from './StackBallCanvas.module.css';
import Link from 'next/link';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_COMPLETE';

interface SkinOption {
  id: BallSkin;
  name: string;
  icon: string;
  desc: string;
  color: string;
}

const SKINS: SkinOption[] = [
  { id: 'neon', name: 'NEON ORB', icon: '🔵', desc: 'Vành đai Neon Cyan phát sáng', color: '#00f0ff' },
  { id: 'magma', name: 'MAGMA CORE', icon: '🔥', desc: 'Dung nham nóng chảy & bụi lửa', color: '#ff4500' },
  { id: 'matrix', name: 'MATRIX CUBE', icon: '🟩', desc: 'Khối lập phương hacker 3D xoay', color: '#39ff14' },
  { id: 'saturn', name: 'SATURN RING', icon: '🪐', desc: 'Hành tinh vành đai trọng lực', color: '#e6b85c' },
  { id: 'disco', name: 'DISCO GLITTER', icon: '🪩', desc: 'Kính đa diện phản chiếu đa sắc', color: '#ff00ff' },
  { id: 'plasma', name: 'PLASMA ARC', icon: '⚡', desc: 'Năng lượng tím & tia sét điện', color: '#bd00ff' },
];

export default function StackBallCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<StackBallGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [fever, setFever] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [selectedSkin, setSelectedSkin] = useState<BallSkin>('neon');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const game = new StackBallGame(canvas);
    gameRef.current = game;

    setBestScore(game.bestScore);

    game.onScore = (s) => setScore(s);
    game.onBestScore = (b) => setBestScore(b);
    game.onLevel = (l) => setLevel(l);
    game.onFever = (f) => setFever(f);
    game.onProgress = (p) => setProgress(Math.floor(p * 100));

    game.onGameOver = () => {
      setGameState('GAME_OVER');
    };

    game.onLevelComplete = () => {
      setGameState('LEVEL_COMPLETE');
    };

    return () => {
      game.destroy();
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Load saved skin on mount
  useEffect(() => {
    const saved = localStorage.getItem('stackBallActiveSkin');
    if (saved && SKINS.some(s => s.id === saved)) {
      setSelectedSkin(saved as BallSkin);
    }
  }, []);

  // Sync activeSkin to game instance when selectedSkin changes
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.activeSkin = selectedSkin;
    }
  }, [selectedSkin]);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.activeSkin = selectedSkin;
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const handleRestart = () => {
    if (gameRef.current) {
      gameRef.current.activeSkin = selectedSkin;
      gameRef.current.restart();
      setGameState('PLAYING');
    }
  };

  const handleNextLevel = () => {
    if (gameRef.current) {
      gameRef.current.activeSkin = selectedSkin;
      gameRef.current.nextLevel();
      setProgress(0);
      setGameState('PLAYING');
    }
  };

  // Input Handlers
  const handlePressStart = (e: React.MouseEvent | React.TouchEvent | KeyboardEvent) => {
    if (gameState !== 'PLAYING') return;
    if (e instanceof KeyboardEvent && e.code !== 'Space') return;
    if (gameRef.current) {
      gameRef.current.setPressing(true);
    }
  };

  const handlePressEnd = (e: React.MouseEvent | React.TouchEvent | KeyboardEvent) => {
    if (e instanceof KeyboardEvent && e.code !== 'Space') return;
    if (gameRef.current) {
      gameRef.current.setPressing(false);
    }
  };

  // Spacebar listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePressStart(e);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePressEnd(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  return (
    <div className={styles.wrapper}>
      {/* Back button */}
      <Link href="/" className={`${styles.backBtn} ${orbitron.className}`}>
        [ BACK_TO_NEXUS ]
      </Link>

      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      />

      {/* HUD Overlay */}
      <div className={`${styles.hud} ${gameState === 'PLAYING' ? styles.hudVisible : ''}`}>

        {/* Level Progress Bar */}
        <div className={styles.progressContainer}>
          <span className={`${styles.levelLabel} ${orbitron.className}`}>{level}</span>
          <div className={styles.progressBarBg}>
            <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
          </div>
          <span className={`${styles.levelLabel} ${orbitron.className}`}>{level + 1}</span>
        </div>

        {/* Fever / Combo Meter */}
        <div className={`${styles.feverContainer} ${fever > 0 ? styles.feverActive : ''}`}>
          <div className={styles.feverLabelBox}>
            <span className={`${styles.feverLabel} ${orbitron.className}`}>
              {fever >= 100 ? 'FEVER MODE' : 'COMBO'}
            </span>
            <span className={`${styles.feverPercent} ${orbitron.className}`}>{fever}%</span>
          </div>
          <div className={styles.feverBarBg}>
            <div 
              className={`${styles.feverBarFill} ${fever >= 100 ? styles.feverMaxed : ''}`} 
              style={{ width: `${fever}%` }} 
            />
          </div>
        </div>

        <div className={styles.instructions}>
          <span>[ CLICK/HOLD OR SPACE TO SMASH ]</span>
        </div>
      </div>

      {/* MENU STATE OVERLAY */}
      {gameState === 'MENU' && (
        <div className={styles.overlay}>
          <div className={`${styles.glassPanel} ${styles.menuPanel}`}>
            <h1 className={`${styles.title} ${orbitron.className}`}>STACK_BALL</h1>
            <p className={styles.subtitle}>THÁP NEON LỰC LY TÂM • V1.0</p>
            
            <div className={styles.panelContent}>
              {/* Left Column: Rules */}
              <div className={styles.rulesCol}>
                <h3 className={`${styles.colTitle} ${orbitron.className}`}>LUẬT CHƠI</h3>
                <div className={styles.gameRules}>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>🥎</span>
                    <span>Giữ chuột / phím Cách để quả bóng đâm sầm đập vỡ đĩa.</span>
                  </div>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>🖤</span>
                    <span>Né các miếng đĩa màu đen, nếu đâm vào là tạch!</span>
                  </div>
                  <div className={styles.ruleItem}>
                    <span className={styles.ruleIcon}>🔥</span>
                    <span>Combo liên tục kích hoạt FEVER MODE siêu càn quét!</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Skin Selection */}
              <div className={styles.skinsCol}>
                <h3 className={`${styles.colTitle} ${orbitron.className}`}>SKIN QUẢ BÓNG</h3>
                <div className={styles.skinGrid}>
                  {SKINS.map((skin) => (
                    <button
                      key={skin.id}
                      className={`${styles.skinCard} ${selectedSkin === skin.id ? styles.skinCardActive : ''}`}
                      style={{ '--skin-glow': skin.color } as any}
                      onClick={() => {
                        setSelectedSkin(skin.id);
                        localStorage.setItem('stackBallActiveSkin', skin.id);
                      }}
                    >
                      <span className={styles.skinIcon}>{skin.icon}</span>
                      <div className={styles.skinInfo}>
                        <span className={`${styles.skinName} ${orbitron.className}`}>{skin.name}</span>
                        <span className={styles.skinDesc}>{skin.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className={`${styles.cyberButton} ${orbitron.className}`} onClick={startGame}>
              INITIALIZE_GAME
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {gameState === 'GAME_OVER' && (
        <div className={styles.overlay}>
          <div className={styles.glassPanel}>
            <h1 className={`${styles.title} ${styles.redText} ${orbitron.className}`}>GAME_OVER</h1>
            <p className={styles.subtitle}>KẾT NỐI BỊ GIÁN ĐOẠN • THỬ LẠI</p>
            <div className={styles.scoreStats}>
              <div className={styles.statLine}>
                <span>FINAL_SCORE:</span>
                <span className={orbitron.className}>{score}</span>
              </div>
              <div className={styles.statLine}>
                <span>BEST_SCORE:</span>
                <span className={orbitron.className}>{bestScore}</span>
              </div>
            </div>
            <button className={`${styles.cyberButton} ${orbitron.className}`} onClick={handleRestart}>
              PLAY_AGAIN
            </button>
          </div>
        </div>
      )}

      {/* LEVEL COMPLETE OVERLAY */}
      {gameState === 'LEVEL_COMPLETE' && (
        <div className={styles.overlay}>
          <div className={styles.glassPanel}>
            <h1 className={`${styles.title} ${styles.greenText} ${orbitron.className}`}>VICTORY</h1>
            <p className={styles.subtitle}>ĐÃ PHÁ VỠ MA TRẬN PHÂN TẦNG</p>
            <div className={styles.scoreStats}>
              <div className={styles.statLine}>
                <span>CURRENT_SCORE:</span>
                <span className={orbitron.className}>{score}</span>
              </div>
            </div>
            <button className={`${styles.cyberButton} ${styles.greenBtn} ${orbitron.className}`} onClick={handleNextLevel}>
              NEXT_LEVEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
