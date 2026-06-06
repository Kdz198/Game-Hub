"use client";
import { useEffect, useRef, useState } from "react";
import { BlockBlastGame } from "@/core/games/block-blast/BlockBlastGame";
import styles from "./BlockBlastCanvas.module.css";
import { Orbitron, Rajdhani } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "700"] });

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER';

export default function BlockBlastCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BlockBlastGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  useEffect(() => {
    setBestScore(parseInt(localStorage.getItem('bb_best') || '0'));
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new BlockBlastGame(canvasRef.current);
    
    const wrapper = canvasRef.current.parentElement;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          game.resize(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    if (wrapper) resizeObserver.observe(wrapper);
    
    game.onScore = (s) => setScore(s);
    game.onGameOver = (s, b) => {
      setScore(s);
      setBestScore(b);
      setGameState('GAME_OVER');
    };

    gameRef.current = game;

    return () => {
      if (wrapper) resizeObserver.disconnect();
      game.destroy();
    };
  }, []);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const restartGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
    }
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
            </div>
          </div>

          {/* MENU OVERLAY */}
          <div className={`${styles.overlay} ${gameState === 'MENU' ? styles.overlayActive : ''}`}>
            <div className={styles.glassPanel}>
              <div className={`${styles.gameTitle} ${orbitron.className}`}>
                <span className={styles.neonTextBlue}>SYNTH</span>
                <span className={styles.neonTextPink}>BLOCK</span>
              </div>
              <p className={styles.subtitle}>NEON PUZZLE MATRIX</p>

              <div className={styles.scoreBoard}>
                <p className={orbitron.className}>SYSTEM RECORD: <span className={styles.neonTextPink}>{bestScore}</span></p>
              </div>

              <button className={`${styles.btn} ${styles.btnPrimary} ${orbitron.className}`} onClick={startGame}>INITIALIZE</button>
              <p className={styles.controlsHint}>Drag and drop shapes to clear lines</p>
            </div>
          </div>

          {/* GAME OVER OVERLAY */}
          <div className={`${styles.overlay} ${gameState === 'GAME_OVER' ? styles.overlayActive : ''}`}>
            <div className={`${styles.glassPanel} ${styles.gameOverPanel}`}>
              <h2 className={`${styles.neonTextRed} ${styles.blink} ${orbitron.className}`}>NO MOVES LEFT</h2>
              <p className={styles.subtitle}>SYSTEM CRASH</p>

              <div className={styles.scoreBoard}>
                <div className={`${styles.scoreBoardRow} ${orbitron.className}`}>
                  <span>SCORE</span>
                  <span className={`${styles.scoreValue} ${styles.neonTextBlue}`}>{score}</span>
                </div>
                <div className={`${styles.scoreBoardRow} ${orbitron.className}`}>
                  <span>RECORD</span>
                  <span className={`${styles.scoreValue} ${styles.neonTextPink}`}>{bestScore}</span>
                </div>
              </div>

              <div className={styles.buttonGroup}>
                <button className={`${styles.btn} ${styles.btnPrimary} ${orbitron.className}`} onClick={restartGame}>RETRY RUN</button>
                <button className={`${styles.btn} ${styles.btnSecondary} ${orbitron.className}`} onClick={() => setGameState('MENU')}>MAIN MENU</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
