"use client";

import { Canvas } from "@react-three/fiber";
import { PointerLockControls, Sky } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Player from "./components/Player";
import Environment from "./components/Environment";
import ZombieSpawner from "./components/ZombieSpawner";

import { Suspense } from "react";

interface FPSGameProps {
  onLock?: () => void;
  onUnlock?: () => void;
}

export default function FPSGame({ onLock, onUnlock }: FPSGameProps) {
  return (
    <Canvas shadows camera={{ fov: 75, position: [0, 1.6, 0] }}>
      <Suspense fallback={null}>
        <color attach="background" args={['#050510']} />
        <ambientLight intensity={1} />
        <directionalLight
        castShadow
        position={[10, 20, 10]}
        intensity={5}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />


      <Physics gravity={[0, -20, 0]}>
        <Player />
        <Environment />
        <ZombieSpawner />
      </Physics>

      <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Suspense>
    </Canvas>
  );
}
