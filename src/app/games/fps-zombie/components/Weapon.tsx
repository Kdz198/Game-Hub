"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface WeaponProps {
  isShooting: boolean;
  isReloading: boolean;
}

export default function Weapon({ isShooting, isReloading }: WeaponProps) {
  const weaponRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.PointLight>(null);
  const { camera } = useThree();

  useFrame((state) => {
    if (!weaponRef.current) return;

    // Base position relative to camera
    const baseOffset = new THREE.Vector3(0.3, -0.3, -0.6);
    const baseRotation = new THREE.Euler(0, 0, 0);

    // Apply sway based on mouse movement/time
    const time = state.clock.getElapsedTime();
    const swayX = Math.sin(time * 2) * 0.005;
    const swayY = Math.cos(time * 4) * 0.005;

    // Apply reload animation
    if (isReloading) {
      baseOffset.y -= 0.5;
      baseRotation.x = Math.PI / 4;
      baseRotation.z = Math.sin(time * 10) * 0.1;
    } 
    // Apply shooting recoil
    else if (isShooting) {
      baseOffset.z += 0.1;
      baseRotation.x += 0.1;
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
      {/* 
        This is a placeholder geometry for the weapon.
        To use a realistic 3D model, replace this mesh with useGLTF() 
        e.g., const { scene } = useGLTF('/models/gun.glb'); <primitive object={scene} />
      */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.1, 0.5]} />
        <meshStandardMaterial color="#111111" metalness={0.2} roughness={0.9} />
      </mesh>

      {/* Neon glowing parts */}
      <mesh position={[0.051, 0, 0]}>
        <boxGeometry args={[0.01, 0.05, 0.4]} />
        <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.051, 0, 0]}>
        <boxGeometry args={[0.01, 0.05, 0.4]} />
        <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={2} />
      </mesh>

      {/* Gun barrel */}
      <mesh position={[0, 0, -0.3]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.2]} />
        <meshStandardMaterial color="#000000" metalness={0.1} roughness={0.9} />
      </mesh>

      {/* Muzzle Flash Light */}
      <pointLight ref={flashRef} position={[0, 0, -0.5]} color="#ffa500" distance={5} decay={2} intensity={0} />
      
      {/* Muzzle Flash Mesh */}
      {isShooting && (
        <mesh position={[0, 0, -0.45]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
