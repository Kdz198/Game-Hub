'use client';
import { useEffect, useRef, useState } from 'react';
import { GridRiderGame } from '@/core/games/grid-rider/GridRiderGame';
import styles from './GridRiderCanvas.module.css';
import Link from 'next/link';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER';

export default function GridRiderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GridRiderGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [checkpointText, setCheckpointText] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Steer button touch states
  const [touchLeftActive, setTouchLeftActive] = useState(false);
  const [touchRightActive, setTouchRightActive] = useState(false);

  useEffect(() => {
    // Detect mobile for virtual controllers
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 800 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const game = new GridRiderGame(canvas);
    gameRef.current = game;

    setBestScore(game.bestScore);

    game.onScore = (s) => setScore(s);
    game.onTime = (t) => setTimeLeft(t);
    game.onSpeed = (sp) => setSpeed(sp);
    game.onDistance = (d) => setDistance(d);
    
    game.onCheckpoint = (msg) => {
      setCheckpointText(msg);
      setTimeout(() => {
        setCheckpointText(null);
      }, 2000);
    };

    game.onGameOver = (s, b, comp) => {
      setScore(s);
      setBestScore(b);
      setCompleted(comp);
      setGameState('GAME_OVER');
    };

    return () => {
      game.destroy();
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.start();
      setGameState('PLAYING');
    }
  };

  const formatTime = (t: number) => {
    const secs = Math.ceil(t);
    return secs.toString().padStart(2, '0');
  };

  // Virtual mobile touch controls helpers
  const handleTouchLeftStart = () => {
    setTouchLeftActive(true);
    if (gameRef.current) gameRef.current.setTouchSteer(-1);
  };
  const handleTouchLeftEnd = () => {
    setTouchLeftActive(false);
    if (gameRef.current) {
      // If right touch is still active, switch to right
      if (touchRightActive) gameRef.current.setTouchSteer(1);
      else gameRef.current.setTouchSteer(0);
    }
  };

  const handleTouchRightStart = () => {
    setTouchRightActive(true);
    if (gameRef.current) gameRef.current.setTouchSteer(1);
  };
  const handleTouchRightEnd = () => {
    setTouchRightActive(false);
    if (gameRef.current) {
      if (touchLeftActive) gameRef.current.setTouchSteer(-1);
      else gameRef.current.setTouchSteer(0);
    }
  };

  const handleTouchGasStart = () => {
    if (gameRef.current) gameRef.current.setTouchAccel(true);
  };
  const handleTouchGasEnd = () => {
    if (gameRef.current) gameRef.current.setTouchAccel(false);
  };

  const handleTouchBrakeStart = () => {
    if (gameRef.current) gameRef.current.setTouchBrake(true);
  };
  const handleTouchBrakeEnd = () => {
    if (gameRef.current) gameRef.current.setTouchBrake(false);
  };

  return (
    <div className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* HUD OVERLAY */}
      <div className={`${styles.hud} ${gameState === 'PLAYING' ? styles.hudVisible : ''}`}>
        <div className={styles.hudTop}>
          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>SCORE</span>
            <span className={`${styles.hudValue} ${orbitron.className}`}>{score}</span>
          </div>

          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>TIME</span>
            <span className={`${styles.hudValue} ${orbitron.className} ${timeLeft <= 10 ? styles.timerDanger : ''}`}>
              {formatTime(timeLeft)}s
            </span>
          </div>

          <div className={styles.hudItem}>
            <span className={styles.hudLabel}>DISTANCE</span>
            <span className={`${styles.hudValue} ${orbitron.className}`}>{distance}m</span>
          </div>
        </div>

        {/* Speedometer Gauges at bottom center */}
        <div className={styles.speedometerBox}>
          <div className={styles.speedDial}>
            <span className={`${styles.speedNumber} ${orbitron.className}`}>{speed}</span>
            <span className={styles.speedUnit}>MPH</span>
          </div>
          <div className={styles.speedBarContainer}>
            <div 
              className={styles.speedBarFill} 
              style={{ width: `${Math.min(100, (speed / 180) * 100)}%` }}
            />
          </div>
        </div>

        {/* Checkpoint Pop-up Alert */}
        {checkpointText && (
          <div className={`${styles.checkpointAlert} ${orbitron.className} animate-pulse`}>
            {checkpointText}
          </div>
        )}

        {/* Virtual Mobile Controls */}
        {isMobile && gameState === 'PLAYING' && (
          <div className={styles.mobileControls}>
            <div className={styles.steeringPad}>
              <button 
                onTouchStart={handleTouchLeftStart}
                onTouchEnd={handleTouchLeftEnd}
                onMouseDown={handleTouchLeftStart}
                onMouseUp={handleTouchLeftEnd}
                className={`${styles.ctrlBtn} ${styles.steerBtn}`}
              >
                ◀
              </button>
              <button 
                onTouchStart={handleTouchRightStart}
                onTouchEnd={handleTouchRightEnd}
                onMouseDown={handleTouchRightStart}
                onMouseUp={handleTouchRightEnd}
                className={`${styles.ctrlBtn} ${styles.steerBtn}`}
              >
                ▶
              </button>
            </div>

            <div className={styles.pedalsPad}>
              <button 
                onTouchStart={handleTouchBrakeStart}
                onTouchEnd={handleTouchBrakeEnd}
                onMouseDown={handleTouchBrakeStart}
                onMouseUp={handleTouchBrakeEnd}
                className={`${styles.ctrlBtn} ${styles.brakeBtn}`}
              >
                BRAKE
              </button>
              <button 
                onTouchStart={handleTouchGasStart}
                onTouchEnd={handleTouchGasEnd}
                onMouseDown={handleTouchGasStart}
                onMouseUp={handleTouchGasEnd}
                className={`${styles.ctrlBtn} ${styles.gasBtn}`}
              >
                GAS
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MAIN MENU */}
      {gameState === 'MENU' && (
        <div className={styles.overlay}>
          <Link href="/" className={`${styles.backBtn} ${orbitron.className}`}>← BACK</Link>
          <div className={styles.menuIcon}>🏎️</div>
          <h1 className={`${styles.menuTitle} ${orbitron.className}`}>GRID RIDER</h1>
          <p className={styles.menuSub}>SYNTHWAVE 3D HIGHWAY DRIFTER</p>
          
          <div className={styles.menuRules}>
            <p>⌨️ Controls: <b>A / D</b> (or <b>Left / Right</b> Arrow) to steer</p>
            <p>⌨️ Speed: <b>W / Up</b> to accelerate, <b>S / Down</b> to brake</p>
            <p>⚡ Boost: Run over <b>cyan neon arrows</b> for super boost speed</p>
            <p>❌ Obstacles: Avoid construction barriers and slow AI traffic</p>
          </div>

          {bestScore > 0 && (
            <p className={`${styles.menuBest} ${orbitron.className}`}>BEST LAP DISTANCE: {bestScore} pts</p>
          )}

          <button onClick={startGame} className={`${styles.startBtn} ${orbitron.className}`}>
            INITIALIZE DRIVE
          </button>
        </div>
      )}

      {/* GAME OVER */}
      {gameState === 'GAME_OVER' && (
        <div className={styles.overlay}>
          <h1 className={`${styles.gameOverTitle} ${orbitron.className}`}>
            {completed ? 'ROUTE COMPLETE' : 'SYSTEM CRASHED'}
          </h1>
          <p className={styles.menuSub}>{completed ? 'YOU RULLED THE SYNTH GRID!' : 'OUT OF TIME'}</p>

          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>SCORE</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#ff00f0'}}>{score}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>BEST</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#39ff14'}}>{bestScore}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>DISTANCE</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#00f0ff'}}>{distance}m</span>
            </div>
          </div>

          <div className={styles.gameOverButtons}>
            <button onClick={startGame} className={`${styles.startBtn} ${orbitron.className}`}>
              RESTART PROTOCOL
            </button>
            <Link href="/" className={`${styles.homeBtn} ${orbitron.className}`}>EXIT</Link>
          </div>
        </div>
      )}
    </div>
  );
}
