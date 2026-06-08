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
        <div className={styles.startScreen} style={{ pointerEvents: "none" }}>
          <h1 className={`${orbitron.className} ${styles.title}`}>ZOMBIE NEXUS</h1>
          <p className={orbitron.className}>CLICK ANYWHERE TO LOCK CURSOR AND PLAY</p>
          <p className={styles.instructions}>
            WASD - Move | SPACE - Jump | SHIFT - Sprint <br/>
            LEFT CLICK - Shoot | RIGHT CLICK - Aim | R - Reload
          </p>
        </div>
      )}

      {/* Always render HUDs, just hide them with CSS or conditionally, but keeping them rendered is fine. */}
      <div id="ammo-hud" className={`${styles.ammoHud} ${orbitron.className}`} style={{ opacity: isPlaying ? 1 : 0 }}>30 / 30</div>
      <div id="wave-hud" className={`${styles.waveHud} ${orbitron.className}`} style={{ opacity: isPlaying ? 1 : 0 }}>WAVE 1 | ALIVE: 5</div>
      <div id="hit-marker" className={styles.hitMarker}>X</div>
      
      <FPSGameCanvas 
        onLock={() => setIsPlaying(true)} 
        onUnlock={() => setIsPlaying(false)} 
      />
    </div>
  );
}
