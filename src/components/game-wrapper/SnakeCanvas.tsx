'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './SnakeCanvas.module.css';
import { SnakeGame } from '../../core/games/snake/SnakeGame';
import RLBrainVisualizer from './RLBrainVisualizer';

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

  // RL Training State
  const [isRLTraining, setIsRLTraining] = useState(false);
  const [rlStats, setRlStats] = useState({ episode: 0, avgScore: 0, epsilon: 1.0 });
  const [viewBrain, setViewBrain] = useState(false);

  // Trigger resize to fit split screen layout changes
  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 150);
  }, [viewBrain, isRLTraining]);

  const handleSaveModel = () => {
    if (gameRef.current?.rlAgent) {
      const success = gameRef.current.rlAgent.saveModel();
      if (success) {
        alert("AI Brain saved successfully to localStorage!");
      }
    }
  };

  const handleLoadModel = async () => {
    if (gameRef.current?.rlAgent) {
      const success = await gameRef.current.rlAgent.loadModel();
      if (success) {
        alert("AI Brain loaded successfully!");
        setRlStats(prev => ({ ...prev, epsilon: 0.01 }));
      } else {
        alert("No saved AI Brain found.");
      }
    }
  };

  const handleResetModel = () => {
    if (confirm("Are you sure you want to reset the AI Brain? This will clear all training progress.")) {
      if (gameRef.current) {
        const { SnakeRLAgent } = require('../../core/games/snake/SnakeRLAgent');
        gameRef.current.rlAgent = new SnakeRLAgent();
        setRlStats({ episode: 0, avgScore: 0, epsilon: 1.0 });
        alert("AI Brain reset!");
      }
    }
  };

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
      gameRef.current.audio.enabled = soundOn && !((autoPlay || isRLTraining) && autoSpeed >= 20);
    }
  }, [autoPlay, autoSpeed, soundOn, isRLTraining]);

  // Handle RL Training Toggle
  useEffect(() => {
    if (gameRef.current) {
      if (isRLTraining) {
        if (!gameRef.current.rlAgent) {
          const { SnakeRLAgent } = require('../../core/games/snake/SnakeRLAgent');
          gameRef.current.rlAgent = new SnakeRLAgent();
        }
        gameRef.current.isRLTraining = true;
        gameRef.current.isAutoPlay = false;
        setAutoPlay(false);

        gameRef.current.onRLStats = (episode, avgScore, epsilon) => {
          setRlStats({ episode, avgScore, epsilon });
        };

        if (gameState !== 'PLAYING') {
          gameRef.current.start();
          setGameState('PLAYING');
          setIsSettingsOpen(false);
        }
      } else {
        gameRef.current.isRLTraining = false;
      }
    }
  }, [isRLTraining, gameState]);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
      setIsSettingsOpen(false);
    }
  };

  return (
    <div className={styles.canvasContainer} ref={containerRef}>
      <div className={`${styles.mainLayout} ${viewBrain && isRLTraining ? styles.layoutSplit : ''}`}>
        <div className={styles.gameWrapper}>
          {isRLTraining && (
            <button 
              className={`${styles.cornerSettingsBtn} ${styles.cornerBrainBtn}`} 
              onClick={() => setViewBrain(!viewBrain)}
              style={{
                right: '5.2rem',
                color: viewBrain ? '#39ff14' : '#00f0ff',
                borderColor: viewBrain ? '#39ff14' : 'rgba(0, 240, 255, 0.3)',
                boxShadow: viewBrain ? '0 0 15px rgba(57, 255, 20, 0.4)' : 'none'
              }}
              aria-label="View Brain"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-4.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2z"></path>
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-4.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2z"></path>
              </svg>
            </button>
          )}

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

        {isRLTraining && (
          <div className={styles.rlHud}>
            <div className={styles.rlStatCol}>
              <span className={styles.rlStatLabel}>EPISODE</span>
              <span className={styles.rlStatVal}>{rlStats.episode}</span>
            </div>
            <div className={styles.rlStatCol}>
              <span className={styles.rlStatLabel}>AVG SCORE (100)</span>
              <span className={styles.rlStatVal}>{rlStats.avgScore.toFixed(1)}</span>
            </div>
            <div className={styles.rlStatCol}>
              <span className={styles.rlStatLabel}>EXPLORATION</span>
              <span className={styles.rlStatVal}>{(rlStats.epsilon * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}

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
                  onClick={() => {
                    setAutoPlay(!autoPlay);
                    if (!autoPlay) {
                      setIsRLTraining(false);
                    }
                  }}
                >
                  {autoPlay ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className={styles.settingRow}>
                <span>AI TRAINING MODE</span>
                <button 
                  className={`${styles.toggleBtn} ${isRLTraining ? styles.toggleOn : ''}`}
                  onClick={() => {
                    setIsRLTraining(!isRLTraining);
                    if (!isRLTraining) {
                      setAutoPlay(false);
                    }
                  }}
                >
                  {isRLTraining ? 'ON' : 'OFF'}
                </button>
              </div>

              {(autoPlay || isRLTraining) && (
                <div className={styles.settingRow}>
                  <span>BOT SPEED</span>
                  <div className={styles.speedGroup}>
                    {[1, 2, 3, 5, 10].map((s) => (
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

              {isRLTraining && (
                <div className={styles.aiControls}>
                  <button className={styles.aiBtn} onClick={handleSaveModel}>
                    SAVE AI BRAIN
                  </button>
                  <button className={styles.aiBtn} onClick={handleLoadModel}>
                    LOAD AI BRAIN
                  </button>
                  <button className={`${styles.aiBtn} ${styles.aiBtnReset}`} onClick={handleResetModel}>
                    RESET BRAIN
                  </button>
                </div>
              )}

              <button className={styles.closeBtn} onClick={() => setIsSettingsOpen(false)}>
                [ CLOSE ]
              </button>
            </div>
          </div>
        )}
        </div>
        {viewBrain && isRLTraining && (
          <div className={styles.brainPanel}>
            <RLBrainVisualizer game={gameRef.current} />
          </div>
        )}
      </div>
    </div>
  );
}
