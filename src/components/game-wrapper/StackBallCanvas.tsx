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

    // Load active skin from localStorage immediately
    const saved = localStorage.getItem('stackBallActiveSkin') as BallSkin;
    if (saved && SKINS.some(s => s.id === saved)) {
      game.activeSkin = saved;
      setSelectedSkin(saved);
    } else {
      game.activeSkin = 'neon';
    }

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

    // Auto-start game immediately on mount
    game.start();
    setGameState('PLAYING');

    return () => {
      game.destroy();
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Sync activeSkin to game instance when selectedSkin changes
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.activeSkin = selectedSkin;
    }
  }, [selectedSkin]);

  const nextSkin = () => {
    const currentIndex = SKINS.findIndex(s => s.id === selectedSkin);
    const nextIndex = (currentIndex + 1) % SKINS.length;
    const nextSkinId = SKINS[nextIndex].id;
    setSelectedSkin(nextSkinId);
    localStorage.setItem('stackBallActiveSkin', nextSkinId);
  };

  const prevSkin = () => {
    const currentIndex = SKINS.findIndex(s => s.id === selectedSkin);
    const prevIndex = (currentIndex - 1 + SKINS.length) % SKINS.length;
    const prevSkinId = SKINS[prevIndex].id;
    setSelectedSkin(prevSkinId);
    localStorage.setItem('stackBallActiveSkin', prevSkinId);
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

      {/* Floating Skin Selector (Top-Right) */}
      <div className={styles.floatingSkinSelector}>
        <button className={styles.hudPickerBtn} onClick={prevSkin} aria-label="Previous Skin">&lt;</button>
        <div className={styles.hudSkinDisplay}>
          <span className={styles.hudSkinIcon}>{SKINS.find(s => s.id === selectedSkin)?.icon}</span>
          <div className={styles.hudSkinInfo}>
            <span className={`${styles.hudSkinTitle} ${orbitron.className}`}>BALL SKIN</span>
            <span className={`${styles.hudSkinName} ${orbitron.className}`}>{SKINS.find(s => s.id === selectedSkin)?.name}</span>
          </div>
        </div>
        <button className={styles.hudPickerBtn} onClick={nextSkin} aria-label="Next Skin">&gt;</button>
      </div>

      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onMouseDownCapture={(e) => {
          // If clicking on floating skin selector, stop propagation so we don't trigger game smash
          if ((e.target as HTMLElement).closest(`.${styles.floatingSkinSelector}`)) {
            e.stopPropagation();
          }
        }}
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
