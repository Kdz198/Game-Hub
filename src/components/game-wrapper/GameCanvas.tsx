"use client";
import { useEffect, useRef, useState } from "react";
import { FlappyBirdGame, BirdSkin, SKINS_CONFIG, audioSys } from "@/core/games/flappy-bird/FlappyBirdGame";
import styles from "./GameCanvas.module.css";
import { Orbitron, Rajdhani } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "700"] });

type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

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

  useEffect(() => {
    setBestScore(parseInt(localStorage.getItem('fb_best') || '0'));
    const savedMute = localStorage.getItem('fb_muted') === 'true';
    setIsMuted(savedMute);
    audioSys.isMuted = savedMute;
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

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    audioSys.isMuted = newState;
    audioSys.updateBgm(gameState);
    localStorage.setItem('fb_muted', newState.toString());
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

  const getMedal = (s: number) => {
    if (s >= 40) return <svg className={`${styles.medalSvg} ${styles.medalCyber}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    if (s >= 30) return <svg className={`${styles.medalSvg} ${styles.medalGold}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    if (s >= 20) return <svg className={`${styles.medalSvg} ${styles.medalSilver}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
    if (s >= 10) return <svg className={`${styles.medalSvg} ${styles.medalBronze}`} viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>;
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
    </div>
  );
}
