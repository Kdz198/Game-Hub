"use client";
import { useState, useEffect } from "react";
import { audioSys } from "@/core/games/flappy-bird/FlappyBirdGame";
import styles from "./HeaderControls.module.css";
import { Orbitron } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["400", "700", "900"] });

export default function HeaderControls() {
  const [isOpen, setIsOpen] = useState(false);
  const [bgmVol, setBgmVol] = useState(1.0);
  const [vfxVol, setVfxVol] = useState(1.0);

  useEffect(() => {
    setBgmVol(audioSys.masterBgmVolume);
    setVfxVol(audioSys.masterVfxVolume);
  }, []);

  const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setBgmVol(val);
    audioSys.masterBgmVolume = val;
    localStorage.setItem('sys_bgm_vol', val.toString());
    // Trigger immediate BGM volume update if game is active
    // We assume game is playing, but usually it's in the menu, so MENU state
    // We can't know the exact state from here easily, but calling updateBgm('MENU') is safeish
    // Actually, setting masterBgmVolume and doing nothing might not take effect immediately until next state change.
    // Let's just update the bgmAudio directly here for instant feedback.
    if (audioSys.bgmAudio && !audioSys.isMuted) {
       // Just update it relatively
       const currentStateVol = audioSys.bgmAudio.volume / (audioSys.masterBgmVolume || 1) || 0.6; // estimate
       audioSys.bgmAudio.volume = currentStateVol * val;
    }
  };

  const handleVfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVfxVol(val);
    audioSys.masterVfxVolume = val;
    localStorage.setItem('sys_vfx_vol', val.toString());
  };

  return (
    <>
      <button className={styles.settingsBtn} onClick={() => setIsOpen(true)} aria-label="Settings">
        <svg viewBox="0 0 24 24" className={styles.icon}>
          <path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </button>

      {isOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
          <div className={`${styles.modalContent} ${orbitron.className}`} onClick={e => e.stopPropagation()}>
            <h2 className={styles.neonTitle}>SYSTEM SETTINGS</h2>
            
            <div className={styles.settingRow}>
              <label>MUSIC (BGM)</label>
              <input 
                type="range" 
                min="0" max="2" step="0.1" 
                value={bgmVol} 
                onChange={handleBgmChange}
                className={styles.slider} 
              />
              <span className={styles.valTxt}>{(bgmVol * 100).toFixed(0)}%</span>
            </div>

            <div className={styles.settingRow}>
              <label>EFFECTS (VFX)</label>
              <input 
                type="range" 
                min="0" max="2" step="0.1" 
                value={vfxVol} 
                onChange={handleVfxChange}
                className={styles.slider} 
              />
              <span className={styles.valTxt}>{(vfxVol * 100).toFixed(0)}%</span>
            </div>

            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}
    </>
  );
}
