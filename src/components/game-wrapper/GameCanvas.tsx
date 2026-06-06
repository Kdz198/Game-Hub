"use client";
import { useEffect, useRef, useState } from "react";
import { FlappyBirdGame, BirdSkin, SKIN_COLORS, SHAPE_PATHS } from "@/core/games/flappy-bird/FlappyBirdGame";
import styles from "./GameCanvas.module.css";
import { Orbitron, Rajdhani } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "700"] });

type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

const AVAILABLE_SKINS: { id: BirdSkin; name: string }[] = [
  { id: 'cyber-arrow', name: 'CYBER ARROW' },
  { id: 'neon-box', name: 'NEON BOX' },
  { id: 'toxic-diamond', name: 'TOXIC DIAMOND' },
  { id: 'plasma-star', name: 'PLASMA STAR' },
];

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FlappyBirdGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [skinIndex, setSkinIndex] = useState(0);

  useEffect(() => {
    setBestScore(parseInt(localStorage.getItem('fb_best') || '0'));
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const wrapper = canvas.parentElement;
    if (wrapper) {
      canvas.width = wrapper.clientWidth;
      canvas.height = wrapper.clientHeight;
    }

    const game = new FlappyBirdGame(canvas);
    
    const handleResize = () => {
      if (wrapper) game.resize(wrapper.clientWidth, wrapper.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    
    game.onScore = (s) => setScore(s);
    game.onGameOver = (s, b) => {
      setScore(s);
      setBestScore(b);
      setGameState('GAME_OVER');
    };

    game.setSkin(AVAILABLE_SKINS[skinIndex].id);
    game.idle();
    game.start(); 
    game.isStarted = false;

    gameRef.current = game;

    return () => {
      window.removeEventListener('resize', handleResize);
      game.destroy();
    };
  }, []);

  const startGame = () => {
    if (gameRef.current) {
      if (gameRef.current.isPaused) {
        gameRef.current.resume();
      }
      if (gameState === 'GAME_OVER') {
        gameRef.current.reset();
        gameRef.current.idle();
      }
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const pauseGame = () => {
    if (gameRef.current && gameState === 'PLAYING') {
      gameRef.current.pause();
      setGameState('PAUSED');
    }
  };

  const resumeGame = () => {
    if (gameRef.current && gameState === 'PAUSED') {
      gameRef.current.resume();
      setGameState('PLAYING');
    }
  };

  const restartGame = () => {
    if (gameRef.current) {
      gameRef.current.reset();
      gameRef.current.idle();
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const nextSkin = () => {
    const next = (skinIndex + 1) % AVAILABLE_SKINS.length;
    setSkinIndex(next);
    if (gameRef.current) gameRef.current.setSkin(AVAILABLE_SKINS[next].id);
  };

  const prevSkin = () => {
    const prev = (skinIndex - 1 + AVAILABLE_SKINS.length) % AVAILABLE_SKINS.length;
    setSkinIndex(prev);
    if (gameRef.current) gameRef.current.setSkin(AVAILABLE_SKINS[prev].id);
  };

  const currentSkin = AVAILABLE_SKINS[skinIndex];
  const skinColor = SKIN_COLORS[currentSkin.id].main;

  const getMedal = (s: number) => {
    if (s >= 40) return <svg className={`${styles.medalSvg} ${styles.medalCyber}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
    if (s >= 30) return <svg className={`${styles.medalSvg} ${styles.medalGold}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
    if (s >= 20) return <svg className={`${styles.medalSvg} ${styles.medalSilver}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
    if (s >= 10) return <svg className={`${styles.medalSvg} ${styles.medalBronze}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
    return <span className={styles.noMedalText}>NONE</span>;
  };

  return (
    <div className={`${styles.canvasContainer} ${rajdhani.className}`}>
      <div className={styles.gameWrapper}>
        <div className={styles.gameContainer}>
          <canvas ref={canvasRef} className={styles.gameCanvas} tabIndex={0} />

          {/* HUD */}
          <div className={`${styles.hud} ${gameState === 'PLAYING' ? styles.hudActive : ''} ${orbitron.className}`}>
            <div className={styles.scoreDisplay}>
              <span className={styles.label}>SCORE</span>
              <span className={styles.scoreValueText}>{score}</span>
            </div>
            <div className={styles.hudRight}>
              <div className={styles.highScoreHud}>
                <span className={styles.label}>BEST</span>
                <span className={styles.highScoreValueText}>{bestScore}</span>
              </div>
              <button className={styles.btnIcon} onClick={pauseGame} aria-label="Pause game">
                <svg viewBox="0 0 24 24" className={styles.icon}>
                  <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* MENU OVERLAY */}
          <div className={`${styles.overlay} ${gameState === 'MENU' ? styles.overlayActive : ''}`}>
            <div className={styles.glassPanel}>
              <div className={`${styles.gameTitle} ${orbitron.className}`}>
                <span className={styles.neonTextBlue}>NEON</span>
                <span className={styles.neonTextPink}>FLAPPER</span>
              </div>
              <p className={styles.subtitle}>RETRO CYBERPUNK ARCADE</p>

              <div className={styles.skinSelectorContainer}>
                <h3 className={orbitron.className}>SELECT YOUR SHIP</h3>
                <div className={styles.skinPicker}>
                  <button className={`${styles.pickerBtn} ${orbitron.className}`} onClick={prevSkin}>&lt;</button>
                  <div className={styles.skinPreviewBox}>
                    <div className={styles.skinPreviewInner}>
                      <svg width="60" height="60" viewBox="-20 -20 40 40" style={{ filter: `drop-shadow(0 0 15px ${skinColor})` }}>
                        <path d={SHAPE_PATHS[currentSkin.id]} fill={skinColor} />
                      </svg>
                    </div>
                    <span className={`${styles.skinName} ${orbitron.className}`}>{currentSkin.name}</span>
                  </div>
                  <button className={`${styles.pickerBtn} ${orbitron.className}`} onClick={nextSkin}>&gt;</button>
                </div>
              </div>

              <div className={`${styles.statsOverview} ${orbitron.className}`}>
                <p>SYSTEM RECORD: <span className={styles.neonTextPink}>{bestScore}</span></p>
              </div>

              <button className={`${styles.btn} ${styles.btnPrimary} ${orbitron.className}`} onClick={startGame}>LAUNCH SYSTEM</button>
              <p className={styles.controlsHint}>Press <span className={`${styles.key} ${orbitron.className}`}>SPACE</span> or <span className={`${styles.key} ${orbitron.className}`}>CLICK</span> to jump</p>
            </div>
          </div>

          {/* PAUSE OVERLAY */}
          <div className={`${styles.overlay} ${gameState === 'PAUSED' ? styles.overlayActive : ''}`}>
            <div className={styles.glassPanel}>
              <h2 className={`${styles.neonTextBlue} ${orbitron.className}`}>SYSTEM PAUSED</h2>
              <p className={styles.pauseDetails}>Current Score: <span className={orbitron.className}>{score}</span></p>
              <div className={styles.buttonGroup}>
                <button className={`${styles.btn} ${styles.btnPrimary} ${orbitron.className}`} onClick={resumeGame}>RESUME</button>
                <button className={`${styles.btn} ${styles.btnSecondary} ${orbitron.className}`} onClick={restartGame}>RESTART</button>
              </div>
            </div>
          </div>

          {/* GAME OVER OVERLAY */}
          <div className={`${styles.overlay} ${gameState === 'GAME_OVER' ? styles.overlayActive : ''}`}>
            <div className={`${styles.glassPanel} ${styles.gameOverPanel}`}>
              <h2 className={`${styles.neonTextRed} ${styles.blink} ${orbitron.className}`}>SYSTEM CRASH</h2>
              <p className={styles.gameOverSubtitle}>CONNECTION TERMINATED</p>

              <div className={styles.scoreBoard}>
                <div className={`${styles.scoreBoardRow} ${orbitron.className}`}>
                  <span>SCORE</span>
                  <span className={`${styles.scoreValue} ${styles.neonTextBlue}`}>{score}</span>
                </div>
                <div className={`${styles.scoreBoardRow} ${orbitron.className}`}>
                  <span>RECORD</span>
                  <span className={`${styles.scoreValue} ${styles.neonTextPink}`}>{bestScore}</span>
                </div>
                <div className={`${styles.medalSection} ${orbitron.className}`}>
                  <span>MEDAL</span>
                  <div className={styles.medalSlot}>
                    {getMedal(score)}
                  </div>
                </div>
              </div>

              <div className={styles.buttonGroup}>
                <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnGlow} ${orbitron.className}`} onClick={restartGame}>RETRY RUN</button>
                <button className={`${styles.btn} ${styles.btnSecondary} ${orbitron.className}`} onClick={() => { setGameState('MENU'); gameRef.current?.reset(); gameRef.current?.idle(); }}>MAIN MENU</button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
