'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './SnakeCanvas.module.css';
import { SnakeGame } from '../../core/games/snake/SnakeGame';

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

export default function SnakeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SnakeGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  // Initialize Canvas and Game
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas to native resolution for sharp rendering
    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize Game
    const game = new SnakeGame(canvas);
    gameRef.current = game;

    // Listeners
    game.onScore = (s) => setScore(s);
    game.onGameOver = (s, b) => {
      setScore(s);
      setBestScore(b);
      setGameState('GAME_OVER');
    };

    // Load best score
    const best = localStorage.getItem('snakeBest');
    if (best) setBestScore(parseInt(best));

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      game.destroy();
    };
  }, []);

  const startGame = (auto: boolean = false) => {
    if (gameRef.current) {
      gameRef.current.isAutoPlay = auto;
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const restartGame = (auto: boolean = false) => {
    if (gameRef.current) {
      gameRef.current.isAutoPlay = auto;
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  return (
    <div className={styles.canvasContainer} ref={containerRef}>
      <div className={styles.gameWrapper}>
        <div className={`${styles.hud} ${gameState === 'PLAYING' ? styles.hudActive : ''}`}>
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreLabel}>SCORE</span>
            <span className={styles.scoreValue}>{score}</span>
          </div>
          <div className={styles.bestDisplay}>
            <span className={styles.bestLabel}>BEST</span>
            <span className={styles.bestValue}>{bestScore}</span>
          </div>
        </div>

        <div className={styles.gameContainer}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {gameState === 'START' && (
          <div className={styles.overlay}>
            <h1 className={styles.overlayTitle}>TRON SNAKE</h1>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className={styles.playButton} onClick={() => startGame(false)}>INITIALIZE</button>
              <button className={styles.playButton} onClick={() => startGame(true)} style={{ background: '#00f0ff' }}>AUTO PLAY</button>
            </div>
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <div className={styles.overlay}>
            <h1 className={`${styles.overlayTitle} ${styles.gameOverTitle}`}>SYSTEM CRASH</h1>
            <div className={styles.overlayScore}>
              FINAL SCORE
              <span>{score}</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className={styles.playButton} onClick={() => restartGame(false)}>RETRY RUN</button>
              <button className={styles.playButton} onClick={() => restartGame(true)} style={{ background: '#00f0ff' }}>AUTO PLAY</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
