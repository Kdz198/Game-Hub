"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface WeaponProps {
  isShooting: boolean;
  isReloading: boolean;
  isAiming: boolean;
}

export default function Weapon({ isShooting, isReloading, isAiming }: WeaponProps) {
  const weaponRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.PointLight>(null);
  const { camera } = useThree();

  useFrame((state) => {
    if (!weaponRef.current) return;

    // Base position relative to camera (center when aiming, offset when hip firing)
    const baseOffset = isAiming 
      ? new THREE.Vector3(0, -0.11, -0.4) // Centered, eye-level with new Holo-sight at Y=0.11
      : new THREE.Vector3(0.3, -0.3, -0.6); // Hip-fire position
    
    const baseRotation = new THREE.Euler(0, 0, 0);

    // Apply sway based on mouse movement/time
    const time = state.clock.getElapsedTime();
    const swayAmount = isAiming ? 0.001 : 0.005;
    const swayX = Math.sin(time * 2) * swayAmount;
    const swayY = Math.cos(time * 4) * swayAmount;

    // Apply reload animation
    if (isReloading) {
      baseOffset.y -= 0.5;
      baseRotation.x = Math.PI / 4;
      baseRotation.z = Math.sin(time * 10) * 0.1;
    } 
    // Apply shooting recoil
    else if (isShooting) {
      baseOffset.z += isAiming ? 0.05 : 0.1;
      baseRotation.x += isAiming ? 0.02 : 0.1;
    }

    baseOffset.x += swayX;
    baseOffset.y += swayY;

    // We calculate the target world position of the weapon based on the camera
    const targetPosition = camera.position.clone().add(
      baseOffset.applyQuaternion(camera.quaternion)
    );
    
    // Smoothly interpolate position
    weaponRef.current.position.lerp(targetPosition, 0.3);
    
    // Smoothly interpolate rotation to match camera + local recoil rotation
    const targetQuaternion = camera.quaternion.clone().multiply(
      new THREE.Quaternion().setFromEuler(baseRotation)
    );
    weaponRef.current.quaternion.slerp(targetQuaternion, 0.3);

    // Muzzle flash visibility
    if (flashRef.current) {
      flashRef.current.intensity = isShooting ? 5 : 0;
    }
  });

  return (
    // Attach weapon to camera using createPortal or just grouping in useFrame
    // In R3F, since Player is updating camera position manually, we can attach this group directly to the camera
    <group ref={weaponRef} position={[0.3, -0.3, -0.6]}>
      {/* Main Body */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[0.08, 0.12, 0.4]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.8} />
      </mesh>

      {/* Grip */}
      <mesh castShadow receiveShadow position={[0, -0.1, 0.1]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.04, 0.15, 0.08]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>

      {/* Magazine */}
      <mesh castShadow receiveShadow position={[0, -0.12, -0.05]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[0.05, 0.15, 0.08]} />
        <meshStandardMaterial color="#111" metalness={0.3} />
      </mesh>

      {/* Stock */}
      <mesh castShadow receiveShadow position={[0, -0.02, 0.25]}>
        <boxGeometry args={[0.06, 0.1, 0.2]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Picatinny Rail */}
      <mesh castShadow receiveShadow position={[0, 0.065, 0]}>
        <boxGeometry args={[0.03, 0.01, 0.3]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
      </mesh>

      {/* Holographic Scope Base */}
      <mesh castShadow receiveShadow position={[0, 0.08, -0.02]}>
        <boxGeometry args={[0.04, 0.02, 0.08]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.3} />
      </mesh>
      
      {/* Holographic Scope Frame (Left) */}
      <mesh castShadow position={[0.018, 0.11, -0.02]}>
        <boxGeometry args={[0.004, 0.04, 0.01]} />
        <meshStandardMaterial color="#222" metalness={0.8} />
      </mesh>
      {/* Holographic Scope Frame (Right) */}
      <mesh castShadow position={[-0.018, 0.11, -0.02]}>
        <boxGeometry args={[0.004, 0.04, 0.01]} />
        <meshStandardMaterial color="#222" metalness={0.8} />
      </mesh>
      {/* Holographic Scope Frame (Top) */}
      <mesh castShadow position={[0, 0.128, -0.02]}>
        <boxGeometry args={[0.04, 0.004, 0.01]} />
        <meshStandardMaterial color="#222" metalness={0.8} />
      </mesh>

      {/* Holographic Glass */}
      <mesh position={[0, 0.11, -0.02]}>
        <planeGeometry args={[0.032, 0.032]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>

      {/* Holographic Reticle (Red Dot / Crosshair) */}
      <mesh position={[0, 0.11, -0.021]}>
        <ringGeometry args={[0.004, 0.006, 16]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.11, -0.021]}>
        <circleGeometry args={[0.001, 8]} />
        <meshBasicMaterial color="#ff0000" blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Neon glowing parts */}
      <mesh position={[0.041, 0, -0.05]}>
        <boxGeometry args={[0.01, 0.02, 0.2]} />
        <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.041, 0, -0.05]}>
        <boxGeometry args={[0.01, 0.02, 0.2]} />
        <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={2} />
      </mesh>

      {/* Gun barrel */}
      <mesh position={[0, 0.02, -0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.02, 0.3, 8]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Muzzle Flash Light */}
      <pointLight ref={flashRef} position={[0, 0.02, -0.5]} color="#ffa500" distance={5} decay={2} intensity={0} />
      
      {/* Muzzle Flash Mesh */}
      {isShooting && (
        <group position={[0, 0.02, -0.5]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[0.15, 0.15]} />
            <meshBasicMaterial color="#ffaa00" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <planeGeometry args={[0.15, 0.15]} />
            <meshBasicMaterial color="#ff5500" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.15, 0.15]} />
            <meshBasicMaterial color="#ffcc00" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* Front-facing glow */}
          <mesh position={[0, 0, -0.05]}>
            <circleGeometry args={[0.08, 16]} />
            <meshBasicMaterial color="#ff2200" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
