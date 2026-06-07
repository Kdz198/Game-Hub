"use client";
import { useEffect, useRef, useState } from "react";
import { FlappyBirdGame, BirdSkin, SKINS_CONFIG, audioSys } from "@/core/games/flappy-bird/FlappyBirdGame";
import styles from "./GameCanvas.module.css";
import { Orbitron, Rajdhani } from "next/font/google";
import RLBrainVisualizer from "./RLBrainVisualizer";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "700"] });

type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'COUNTDOWN' | 'GAME_OVER';

const AVAILABLE_SKINS: { id: BirdSkin; name: string }[] = [
  { id: 'cyber-swift', name: 'CYBER SWIFT' },
  { id: 'laser-phoenix', name: 'LASER PHOENIX' },
  { id: 'vector-gold', name: 'VECTOR GOLD' },
  { id: 'synth-pulse', name: 'SYNTH PULSE' },
];

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FlappyBirdGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [skinIndex, setSkinIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bgmVol, setBgmVol] = useState(1.0);
  const [vfxVol, setVfxVol] = useState(1.0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // RL Training State
  const [isRLTraining, setIsRLTraining] = useState(false);
  const [isExploration, setIsExploration] = useState(true);
  const [rlStats, setRlStats] = useState({ episode: 0, avgScore: 0, epsilon: 1.0 });
  const [viewBrain, setViewBrain] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(1);

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
        const { FlappyRLAgent } = require('@/core/games/flappy-bird/FlappyRLAgent');
        gameRef.current.rlAgent = new FlappyRLAgent();
        setRlStats({ episode: 0, avgScore: 0, epsilon: 1.0 });
        alert("AI Brain reset!");
      }
    }
  };

  useEffect(() => {
    setBestScore(parseInt(localStorage.getItem('fb_best') || '0'));
    const savedMuted = localStorage.getItem('fb_muted');
      if (savedMuted) {
        const muted = savedMuted === 'true';
        setIsMuted(muted);
        audioSys.isMuted = muted;
      }
      setBgmVol(audioSys.masterBgmVolume);
      setVfxVol(audioSys.masterVfxVolume);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new FlappyBirdGame(canvasRef.current);
    
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

    game.setSkin(AVAILABLE_SKINS[skinIndex].id);
    game.idle();
    game.start(); 
    game.isStarted = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGameState(prev => {
          if (prev === 'PLAYING') {
            game.pause();
            return 'PAUSED';
          }
          return prev;
        });
      }
    };

    const handleBlur = () => {
      setGameState(prev => {
        if (prev === 'PLAYING') {
          game.pause();
          return 'PAUSED';
        }
        return prev;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);

    gameRef.current = game;

    return () => {
      if (wrapper) resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      game.destroy();
    };
  }, []);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCountdown(null);
      if (gameRef.current) {
        gameRef.current.resume();
        setGameState('PLAYING');
      }
    }
  }, [countdown]);

  // Update BGM when gameState changes
  useEffect(() => {
      audioSys.updateBgm(gameState);
  }, [gameState, isMuted]);

  // Update preview canvas when skin changes
  useEffect(() => {
    if (previewCanvasRef.current) {
        const ctx = previewCanvasRef.current.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, 80, 80);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
            ctx.beginPath();
            ctx.arc(40, 40, 25, 0, Math.PI * 2);
            ctx.fill();

            const skin = SKINS_CONFIG[AVAILABLE_SKINS[skinIndex].id];
            skin.draw(ctx, 40, 40, 32, -0.1, skin.primaryColor, skin.secondaryColor, skin.accentColor);
        }
    }
  }, [skinIndex, gameState]);

  // Sync visualization state to game object
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.isVisualizing = viewBrain && isRLTraining;
    }
  }, [viewBrain, isRLTraining]);

  // Update game settings when toggled
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.autoPlaySpeed = autoSpeed;
      gameRef.current.isExplorationEnabled = isExploration;
    }
  }, [autoSpeed, isExploration]);

  // Handle RL Training Toggle
  useEffect(() => {
    if (gameRef.current) {
      if (isRLTraining) {
        if (!gameRef.current.rlAgent) {
          const { FlappyRLAgent } = require("@/core/games/flappy-bird/FlappyRLAgent");
          gameRef.current.rlAgent = new FlappyRLAgent();
        }
        gameRef.current.isRLTraining = true;

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

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    audioSys.isMuted = newState;
    audioSys.updateBgm(gameState);
    localStorage.setItem('fb_muted', newState.toString());
  };

  const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setBgmVol(val);
    audioSys.masterBgmVolume = val;
    localStorage.setItem('sys_bgm_vol', val.toString());
    if (audioSys.bgmAudio && !audioSys.isMuted) {
       const currentStateVol = audioSys.bgmAudio.volume / (audioSys.masterBgmVolume || 1) || 0.6;
       audioSys.bgmAudio.volume = Math.max(0, Math.min(1, currentStateVol * val));
    }
  };

  const handleVfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVfxVol(val);
    audioSys.masterVfxVolume = val;
    localStorage.setItem('sys_vfx_vol', val.toString());
  };

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
      setCountdown(3);
      setGameState('COUNTDOWN');
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

  const getMedal = (s: number) => {
    if (s >= 40) return <svg className={`${styles.medalSvg} ${styles.medalCyber}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    if (s >= 30) return <svg className={`${styles.medalSvg} ${styles.medalGold}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    if (s >= 20) return <svg className={`${styles.medalSvg} ${styles.medalSilver}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    if (s >= 10) return <svg className={`${styles.medalSvg} ${styles.medalBronze}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    return <span className={styles.noMedalText}>NONE</span>;
  };

  return (
    <div className={`${styles.canvasContainer} ${rajdhani.className}`}>
      <div className={`${styles.mainLayout} ${viewBrain && isRLTraining ? styles.layoutSplit : ''}`}>
        <div className={styles.gameWrapper}>
          <div className={styles.gameContainer}>
            <canvas ref={canvasRef} className={styles.gameCanvas} tabIndex={0} />

            {/* HUD */}
            <div className={`${styles.hud} ${gameState === 'PLAYING' ? styles.hudActive : ''} ${orbitron.className}`}>
              <div className={styles.hudTopRow}>
                <div className={styles.hudScoreGroup}>
                  <div className={styles.scoreDisplay}>
                    <span className={styles.label}>SCORE</span>
                    <span className={styles.scoreValueText}>{score}</span>
                  </div>
                  <div className={styles.highScoreHud}>
                    <span className={styles.label}>BEST</span>
                    <span className={styles.highScoreValueText}>{bestScore}</span>
                  </div>
                </div>

                <div className={styles.hudControlsGroup}>
                  {isRLTraining && (
                    <button 
                      className={`${styles.btnIcon} ${styles.brainBtn}`} 
                      onClick={() => setViewBrain(!viewBrain)}
                      style={{
                        color: viewBrain ? '#39ff14' : '#00f0ff',
                        textShadow: viewBrain ? '0 0 10px #39ff14' : 'none'
                      }}
                      aria-label="Toggle Neural Network"
                    >
                      <svg viewBox="0 0 24 24" className={styles.icon} fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-4.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2z"></path>
                        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-4.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2z"></path>
                      </svg>
                    </button>
                  )}
                  
                  <button 
                    className={styles.btnIcon} 
                    onClick={() => setIsSettingsOpen(true)} 
                    aria-label="Settings"
                  >
                    <svg viewBox="0 0 24 24" className={styles.icon}>
                      <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                    </svg>
                  </button>
                  
                  <button className={styles.btnIcon} onClick={pauseGame} aria-label="Pause game">
                    <svg viewBox="0 0 24 24" className={styles.icon}>
                      <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  </button>
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
            </div>

            {/* MENU OVERLAY */}
            <div className={`${styles.overlay} ${gameState === 'MENU' ? styles.overlayActive : ''}`}>
              <div className={styles.glassPanel}>
                <div className={`${styles.gameTitle} ${orbitron.className}`}>
                  <span className={styles.neonTextBlue}>NEON</span>
                  <span className={styles.neonTextPink}>FLAPPER</span>
                </div>
                <p className={styles.subtitle}>RETRO CYBERPUNK ARCADE</p>

                <button className={styles.settingsBtn} onClick={() => setIsSettingsOpen(true)} aria-label="Settings">
                  <svg viewBox="0 0 24 24" className={styles.icon}>
                    <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                  </svg>
                </button>

                <div className={styles.skinSelectorContainer}>
                  <h3 className={orbitron.className}>SELECT YOUR SHIP</h3>
                  <div className={styles.skinPicker}>
                    <button className={`${styles.pickerBtn} ${orbitron.className}`} onClick={prevSkin}>&lt;</button>
                    <div className={styles.skinPreviewBox}>
                      <div className={styles.skinPreviewInner}>
                        <canvas ref={previewCanvasRef} width={80} height={80} />
                      </div>
                      <span className={`${styles.skinName} ${orbitron.className}`}>{AVAILABLE_SKINS[skinIndex].name}</span>
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

            {/* SETTINGS OVERLAY */}
            <div className={`${styles.overlay} ${isSettingsOpen ? styles.overlayActive : ''}`}>
              <div className={`${styles.glassPanel} ${styles.settingsPanel}`}>
                <h2 className={`${styles.neonTextBlue} ${orbitron.className}`}>SYSTEM SETTINGS</h2>
                
                <div className={styles.settingRow}>
                  <label className={orbitron.className}>MUSIC (BGM)</label>
                  <input 
                    type="range" min="0" max="2" step="0.1" 
                    value={bgmVol} onChange={handleBgmChange}
                    className={styles.slider} 
                  />
                  <span className={`${styles.valTxt} ${orbitron.className}`}>{(bgmVol * 100).toFixed(0)}%</span>
                </div>

                <div className={styles.settingRow}>
                  <label className={orbitron.className}>EFFECTS (VFX)</label>
                  <input 
                    type="range" min="0" max="2" step="0.1" 
                    value={vfxVol} onChange={handleVfxChange}
                    className={styles.slider} 
                  />
                  <span className={`${styles.valTxt} ${orbitron.className}`}>{(vfxVol * 100).toFixed(0)}%</span>
                </div>

                <div className={styles.settingRow}>
                  <span className={orbitron.className}>AI TRAINING MODE</span>
                  <button 
                    className={`${styles.toggleBtn} ${isRLTraining ? styles.toggleOn : ''}`}
                    onClick={() => {
                      setIsRLTraining(!isRLTraining);
                    }}
                  >
                    {isRLTraining ? 'ON' : 'OFF'}
                  </button>
                </div>

                {isRLTraining && (
                  <div className={styles.settingRow}>
                    <span className={orbitron.className}>AI EXPLORATION</span>
                    <button 
                      className={`${styles.toggleBtn} ${isExploration ? styles.toggleOn : ''}`}
                      onClick={() => setIsExploration(!isExploration)}
                    >
                      {isExploration ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}

                {isRLTraining && (
                  <div className={styles.settingRow}>
                    <span className={orbitron.className}>BOT SPEED</span>
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

                <button className={`${styles.btn} ${styles.btnSecondary} ${orbitron.className}`} onClick={() => setIsSettingsOpen(false)}>CLOSE</button>
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

            {/* COUNTDOWN OVERLAY */}
            <div className={`${styles.overlay} ${(gameState === 'COUNTDOWN') ? styles.overlayActive : ''}`}>
               <div className={`${styles.countdownText} ${orbitron.className}`}>
                  {countdown && countdown > 0 ? countdown : 'GO!'}
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
            
            {/* QUICK CONTROLS IN-GAME (SOUND & MUTE) */}
            <div className={styles.cornerControls}>
                <button className={styles.btnIcon} onClick={toggleMute} aria-label="Toggle Sound">
                    {isMuted ? (
                      <svg viewBox="0 0 24 24" className={styles.icon}>
                        <path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className={styles.icon}>
                        <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    )}
                </button>
            </div>

          </div>
        </div>

        {viewBrain && isRLTraining && (
          <div className={styles.brainPanel}>
            <RLBrainVisualizer game={gameRef.current} gameType="flappy-bird" />
          </div>
        )}
      </div>
    </div>
  );
}
