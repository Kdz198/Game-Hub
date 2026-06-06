"use client";
import { useEffect, useRef, useState } from "react";
import { FlappyBirdGame, BirdSkin, SKIN_COLORS, ANIMAL_PATHS, ANIMAL_EYES } from "@/core/games/flappy-bird/FlappyBirdGame";
import styles from "./GameCanvas.module.css";
import { Orbitron } from "next/font/google";
import Link from "next/link";

const orbitron = Orbitron({ subsets: ["latin"] });

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER';

const AVAILABLE_SKINS: { id: BirdSkin; name: string }[] = [
  { id: 'cyber-bird', name: 'CYBER BIRD' },
  { id: 'neon-cat', name: 'NEON CAT' },
  { id: 'toxic-bat', name: 'TOXIC BAT' },
  { id: 'plasma-fox', name: 'PLASMA FOX' },
];

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FlappyBirdGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [skinIndex, setSkinIndex] = useState(0);

  useEffect(() => {
    // Load best score on mount
    setBestScore(parseInt(localStorage.getItem('fb_best') || '0'));
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const wrapper = canvas.parentElement;
    if (wrapper) {
      canvas.width = wrapper.clientWidth;
      canvas.height = wrapper.clientHeight;
    }

    const game = new FlappyBirdGame(canvas);
    
    const handleResize = () => {
      if (wrapper) {
        game.resize(wrapper.clientWidth, wrapper.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    
    game.onScore = (s) => setScore(s);
    game.onGameOver = (s, b) => {
      setScore(s);
      setBestScore(b);
      setGameState('GAME_OVER');
    };

    game.setSkin(AVAILABLE_SKINS[skinIndex].id);
    game.idle(); // Draw background and idle ship
    
    // Auto start game loop to render particles/stars even in menu
    game.start(); 
    game.isStarted = false; // keep it idle

    gameRef.current = game;

    return () => {
      window.removeEventListener('resize', handleResize);
      game.destroy();
    };
  }, []);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const nextSkin = () => {
    const next = (skinIndex + 1) % AVAILABLE_SKINS.length;
    setSkinIndex(next);
    if (gameRef.current) {
      gameRef.current.setSkin(AVAILABLE_SKINS[next].id);
    }
  };

  const prevSkin = () => {
    const prev = (skinIndex - 1 + AVAILABLE_SKINS.length) % AVAILABLE_SKINS.length;
    setSkinIndex(prev);
    if (gameRef.current) {
      gameRef.current.setSkin(AVAILABLE_SKINS[prev].id);
    }
  };

  const currentSkin = AVAILABLE_SKINS[skinIndex];
  const skinColor = SKIN_COLORS[currentSkin.id].main;

  return (
    <div className={`${styles.canvasContainer} ${orbitron.className}`}>
      <div className={styles.gameWrapper}>
        <canvas ref={canvasRef} className={styles.gameCanvas} tabIndex={0} />
        
        {/* HTML UI OVERLAYS */}
        
        {/* Top left back button in menu/game over */}
        {gameState !== 'PLAYING' && (
           <Link href="/" className={styles.homeBtn}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
           </Link>
        )}

        {gameState === 'MENU' && (
          <div className={styles.menuPanel}>
            <div className={styles.titleBox}>
              <h1 className={styles.gameTitle}>NEON</h1>
              <h1 className={styles.gameTitlePink}>FLAPPER</h1>
              <p className={styles.subtitle}>RETRO CYBERPUNK ARCADE</p>
            </div>

            <div className={styles.shipSelectorCard}>
              <div className={styles.selectorLabel}>SELECT YOUR SHIP</div>
              <div className={styles.carousel}>
                <button className={styles.arrowBtn} onClick={prevSkin}>&lt;</button>
                <div className={styles.shipPreviewBox}>
                  <svg 
                    width="48" 
                    height="48" 
                    viewBox="-20 -20 40 40" 
                    style={{
                      filter: `drop-shadow(0 0 10px ${SKIN_COLORS[currentSkin.id].glow})`
                    }}
                  >
                    {/* Animal body outline */}
                    <path 
                      d={ANIMAL_PATHS[currentSkin.id]} 
                      fill="rgba(0,0,0,0.6)" 
                      stroke={skinColor} 
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    {/* Eye */}
                    <circle 
                      cx={ANIMAL_EYES[currentSkin.id].x} 
                      cy={ANIMAL_EYES[currentSkin.id].y} 
                      r="2.5" 
                      fill="#fff" 
                    />
                  </svg>
                  <div className={styles.shipName}>{currentSkin.name}</div>
                </div>
                <button className={styles.arrowBtn} onClick={nextSkin}>&gt;</button>
              </div>
            </div>

            <div className={styles.recordText}>
              SYSTEM RECORD: <span className={styles.recordNumber}>{bestScore}</span>
            </div>

            <button className={styles.launchBtn} onClick={startGame}>
              LAUNCH SYSTEM
            </button>

            <div className={styles.instruction}>
              Press <span className={styles.key}>SPACE</span> or <span className={styles.key}>CLICK/TAP</span> to jump
            </div>
          </div>
        )}

        {gameState === 'PLAYING' && (
          <div className={styles.hudTop}>
            <div className={styles.hudBox}>
              <span className={styles.hudLabel}>SCORE</span>
              <div className={styles.hudValue}>{score}</div>
            </div>
            <div className={styles.hudBox}>
              <span className={styles.hudLabel}>BEST</span>
              <div className={styles.hudValuePink}>{bestScore}</div>
            </div>
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <div className={styles.crashOverlay}>
            <div className={styles.crashModal}>
              <h2 className={styles.crashTitle}>SYSTEM CRASH</h2>
              <p className={styles.crashSub}>CONNECTION TERMINATED</p>
              
              <div className={styles.statsBox}>
                <div className={styles.statRow}>
                  <span>SCORE</span>
                  <span className={styles.statScore}>{score}</span>
                </div>
                <div className={styles.statRow}>
                  <span>RECORD</span>
                  <span className={styles.statRecord}>{bestScore}</span>
                </div>
              </div>
              
              <button className={styles.retryBtn} onClick={startGame}>
                RETRY RUN
              </button>
              <button className={styles.menuBtn} onClick={() => setGameState('MENU')}>
                MAIN MENU
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
