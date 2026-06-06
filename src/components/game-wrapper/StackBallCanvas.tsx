'use client';
import { useEffect, useRef, useState } from 'react';
import { StackBallGame } from '@/core/games/stack-ball/StackBallGame';
import styles from './StackBallCanvas.module.css';
import Link from 'next/link';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_COMPLETE';

export default function StackBallCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<StackBallGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [fever, setFever] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 100

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

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const handleRestart = () => {
    if (gameRef.current) {
      gameRef.current.restart();
      setGameState('PLAYING');
    }
  };

  const handleNextLevel = () => {
    if (gameRef.current) {
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
        <div className={styles.hudTop}>
          <div className={styles.levelBox}>
            <span className={styles.hudLabel}>LEVEL</span>
            <span className={`${styles.hudValue} ${orbitron.className}`}>{level}</span>
          </div>

          <div className={styles.scoreBox}>
            <span className={styles.hudLabel}>SCORE</span>
            <span className={`${styles.hudValue} ${orbitron.className}`}>{score}</span>
          </div>
          
          <div className={styles.bestBox}>
            <span className={styles.hudLabel}>BEST</span>
            <span className={`${styles.hudValue} ${orbitron.className}`}>{bestScore}</span>
          </div>
        </div>

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
          <div className={styles.glassPanel}>
            <h1 className={`${styles.title} ${orbitron.className}`}>STACK_BALL</h1>
            <p className={styles.subtitle}>THÁP NEON LỰC LY TÂM • V1.0</p>
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
                <span>Đập vỡ liên tiếp để kích hoạt FEVER MODE hủy diệt cả miếng đen!</span>
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
