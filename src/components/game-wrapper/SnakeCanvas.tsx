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
  const [autoSpeed, setAutoSpeed] = useState(1);
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

    game.onScore = (s) => {
      setScore(s);
      setBestScore(prev => {
        if (s > prev) {
          localStorage.setItem('snakeBest', s.toString());
          return s;
        }
        return prev;
      });
    };
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
      gameRef.current.autoPlaySpeed = autoSpeed;
      gameRef.current.audio.enabled = soundOn && !(autoPlay && autoSpeed >= 20);
    }
  }, [autoPlay, autoSpeed, soundOn]);

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
        <button 
          className={styles.cornerSettingsBtn} 
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

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

              {autoPlay && (
                <div className={styles.settingRow}>
                  <span>BOT SPEED</span>
                  <div className={styles.speedGroup}>
                    {[1, 2, 3, 5, 10, 20].map((s) => (
                      <button
                        key={s}
                        className={`${styles.speedBtn} ${autoSpeed === s ? styles.speedBtnActive : ''}`}
                        onClick={() => setAutoSpeed(s)}
                      >
                        x{s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
