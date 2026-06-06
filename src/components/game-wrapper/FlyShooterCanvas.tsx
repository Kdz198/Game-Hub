'use client';
import { useEffect, useRef, useState } from 'react';
import { FlyShooterGame } from '@/core/games/fly-shooter/FlyShooterGame';
import styles from './FlyShooterCanvas.module.css';
import Link from 'next/link';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700', '900'] });

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER';

export default function FlyShooterCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FlyShooterGame | null>(null);

  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [wave, setWave] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const game = new FlyShooterGame(canvas);
    gameRef.current = game;

    setBestScore(game.bestScore);

    game.onScore = (s) => {
      setScore(s);
      setBestScore(prev => {
        if (s > prev) {
          localStorage.setItem('flyShooterBest', s.toString());
          return s;
        }
        return prev;
      });
    };
    game.onCombo = (c) => setCombo(c);
    game.onTime = (t) => setTimeLeft(t);
    game.onWave = (w) => setWave(w);
    game.onGameOver = (s, b) => {
      setScore(s);
      setBestScore(b);
      setGameState('GAME_OVER');
    };

    return () => {
      game.destroy();
      window.removeEventListener('resize', resize);
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

  return (
    <div className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* HUD */}
      <div className={`${styles.hud} ${gameState === 'PLAYING' ? styles.hudVisible : ''}`}>
        <div className={styles.hudLeft}>
          <div className={styles.timerBox}>
            <span className={styles.timerLabel}>TIME</span>
            <span className={`${styles.timerValue} ${orbitron.className} ${timeLeft <= 5 ? styles.timerDanger : ''}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        <div className={styles.hudCenter}>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>SCORE</span>
            <span className={`${styles.scoreValue} ${orbitron.className}`}>{score}</span>
          </div>
          {combo > 1 && (
            <div className={`${styles.comboBox} ${orbitron.className}`}>
              <span className={styles.comboValue}>x{combo}</span>
              <span className={styles.comboLabel}>COMBO</span>
            </div>
          )}
        </div>

        <div className={styles.hudRight}>
          <div className={styles.waveBox}>
            <span className={styles.waveLabel}>WAVE</span>
            <span className={`${styles.waveValue} ${orbitron.className}`}>{wave}</span>
          </div>
        </div>
      </div>

      {/* MENU */}
      {gameState === 'MENU' && (
        <div className={styles.overlay}>
          <Link href="/" className={`${styles.backBtn} ${orbitron.className}`}>← BACK</Link>
          <div className={styles.menuIcon}>🪲</div>
          <h1 className={`${styles.menuTitle} ${orbitron.className}`}>BUG HUNTER</h1>
          <p className={styles.menuSub}>EXTERMINATE HOSTILE DRONE BUGS</p>
          <div className={styles.menuRules}>
            <p>🎯 Click/Tap to shoot the bugs</p>
            <p>🔥 Chain kills for combo multiplier</p>
            <p>⏱️ Survive 30 seconds</p>
          </div>
          {bestScore > 0 && (
            <p className={`${styles.menuBest} ${orbitron.className}`}>BEST: {bestScore}</p>
          )}
          <button onClick={startGame} className={`${styles.startBtn} ${orbitron.className}`}>
            DEPLOY HUNTER
          </button>
        </div>
      )}

      {/* GAME OVER */}
      {gameState === 'GAME_OVER' && (
        <div className={styles.overlay}>
          <h1 className={`${styles.gameOverTitle} ${orbitron.className}`}>MISSION COMPLETE</h1>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>SCORE</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#ff3333'}}>{score}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>BEST</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#39ff14'}}>{bestScore}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>MAX COMBO</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#fff01f'}}>x{gameRef.current?.maxCombo || 0}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>WAVE</span>
              <span className={`${styles.statValue} ${orbitron.className}`} style={{color: '#00f0ff'}}>{wave}</span>
            </div>
          </div>
          <div className={styles.gameOverButtons}>
            <button onClick={startGame} className={`${styles.startBtn} ${orbitron.className}`}>
              RETRY MISSION
            </button>
            <Link href="/" className={`${styles.homeBtn} ${orbitron.className}`}>EXIT</Link>
          </div>
        </div>
      )}
    </div>
  );
}
