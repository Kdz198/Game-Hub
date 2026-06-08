"use client";

import dynamic from "next/dynamic";
import { Orbitron } from "next/font/google";
import styles from "./fps.module.css";
import Link from "next/link";
import { useState } from "react";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700"] });

// Dynamically import the Canvas part to prevent SSR issues with Three.js
const FPSGameCanvas = dynamic(() => import("./FPSGame"), { ssr: false });

export default function FPSZombiePage() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.overlay}>
        <Link href="/" className={`${styles.backButton} ${orbitron.className}`}>
          [ ESC_TO_HUB ]
        </Link>
        <div className={styles.crosshair}>+</div>
      </div>
      
      {!isPlaying && (
        <div className={styles.startScreen}>
          <h1 className={`${orbitron.className} ${styles.title}`}>ZOMBIE NEXUS</h1>
          <p className={orbitron.className}>CLICK TO LOCK CURSOR AND PLAY</p>
          <p className={styles.instructions}>
            WASD - Move | SPACE - Jump | SHIFT - Sprint <br/>
            LEFT CLICK - Shoot | R - Reload
          </p>
          <button 
            className={`${styles.playButton} ${orbitron.className}`}
            onClick={() => setIsPlaying(true)}
          >
            START OPERATION
          </button>
        </div>
      )}

      {isPlaying && (
        <>
          <div id="ammo-hud" className={`${styles.ammoHud} ${orbitron.className}`}>30 / 30</div>
          <div id="wave-hud" className={`${styles.waveHud} ${orbitron.className}`}>WAVE 1 | ALIVE: 5</div>
          <div id="hit-marker" className={styles.hitMarker}>X</div>
          <FPSGameCanvas />
        </>
      )}
    </div>
  );
}
