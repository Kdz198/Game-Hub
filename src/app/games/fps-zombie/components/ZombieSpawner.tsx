"use client";

import { useFrame } from "@react-three/fiber";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";

function Zombie({ position }: { position: [number, number, number] }) {
  const rigidBody = useRef<any>(null);
  const [health, setHealth] = useState(100);

  // Very basic AI: move towards (0,0,0) assuming player is generally there, 
  // or better, we could pass playerRef, but for simplicity, we just slowly move them to origin.
  useFrame(() => {
    if (!rigidBody.current || health <= 0) return;

    const currentPos = rigidBody.current.translation();
    const direction = new THREE.Vector3(0 - currentPos.x, 0, 0 - currentPos.z).normalize();
    
    // Slow movement speed
    const speed = 1.5;
    rigidBody.current.setLinvel({ 
      x: direction.x * speed, 
      y: rigidBody.current.linvel().y, 
      z: direction.z * speed 
    }, true);
  });

  if (health <= 0) return null; // Zombie is dead

  return (
    <RigidBody ref={rigidBody} colliders={false} mass={1} position={position} type="dynamic" lockRotations>
      <CapsuleCollider args={[0.4, 0.5]} position={[0, 0, 0]} />
      {/* 
        Placeholder for Zombie Model 
        Replace with useGLTF() later
      */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.4, 1, 4, 8]} />
        <meshStandardMaterial color="#2d4c1e" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Zombie Head */}
      <mesh castShadow receiveShadow position={[0, 0.8, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#3a5f27" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

export default function ZombieSpawner() {
  // Spawn a few zombies around the map
  const initialZombies = [
    { id: 1, position: [15, 5, 15] as [number, number, number] },
    { id: 2, position: [-15, 5, -10] as [number, number, number] },
    { id: 3, position: [10, 5, -20] as [number, number, number] },
    { id: 4, position: [-5, 5, 20] as [number, number, number] },
  ];

  return (
    <>
      {initialZombies.map((z) => (
        <Zombie key={z.id} position={z.position} />
      ))}
    </>
  );
}
