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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  // Initialize Canvas and Game
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const game = new SnakeGame(canvas);
    gameRef.current = game;

    game.onScore = (s) => setScore(s);
    game.onGameOver = (s, b) => {
      setScore(s);
      setBestScore(b);
      setGameState('GAME_OVER');
    };

    const best = localStorage.getItem('snakeBest');
    if (best) setBestScore(parseInt(best));

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      game.destroy();
    };
  }, []);

  // Update game settings when toggled
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.isAutoPlay = autoPlay;
    }
  }, [autoPlay]);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
      setIsSettingsOpen(false);
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
          
          <button 
            className={styles.settingsButton} 
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Settings"
          >
            [ SYS_CONFIG ]
          </button>

          <div className={styles.bestDisplay}>
            <span className={styles.bestLabel}>BEST</span>
            <span className={styles.bestValue}>{bestScore}</span>
          </div>
        </div>

        <div className={styles.gameContainer}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {gameState === 'START' && !isSettingsOpen && (
          <div className={styles.overlay}>
            <h1 className={styles.overlayTitle}>TRON SNAKE</h1>
            <button className={styles.playButton} onClick={startGame}>INITIALIZE</button>
          </div>
        )}

        {gameState === 'GAME_OVER' && !isSettingsOpen && (
          <div className={styles.overlay}>
            <h1 className={`${styles.overlayTitle} ${styles.gameOverTitle}`}>SYSTEM CRASH</h1>
            <div className={styles.overlayScore}>
              FINAL SCORE
              <span>{score}</span>
            </div>
            <button className={styles.playButton} onClick={startGame}>RETRY RUN</button>
          </div>
        )}

        {isSettingsOpen && (
          <div className={styles.overlay}>
            <div className={styles.settingsModal}>
              <h2 className={styles.settingsTitle}>SETTINGS</h2>
              
              <div className={styles.settingRow}>
                <span>SOUND EFFECTS</span>
                <button 
                  className={`${styles.toggleBtn} ${soundOn ? styles.toggleOn : ''}`}
                  onClick={() => setSoundOn(!soundOn)}
                >
                  {soundOn ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className={styles.settingRow}>
                <span>AUTO PLAY BOT</span>
                <button 
                  className={`${styles.toggleBtn} ${autoPlay ? styles.toggleOn : ''}`}
                  onClick={() => setAutoPlay(!autoPlay)}
                >
                  {autoPlay ? 'ON' : 'OFF'}
                </button>
              </div>

              <button className={styles.closeBtn} onClick={() => setIsSettingsOpen(false)}>
                [ CLOSE ]
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
