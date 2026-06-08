"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";

function Zombie({ id, position }: { id: number, position: [number, number, number] }) {
  const rigidBody = useRef<any>(null);
  const { camera } = useThree();
  const [health, setHealth] = useState(100);
  const [isHit, setIsHit] = useState(false);

  useEffect(() => {
    const handleHit = (e: any) => {
      if (e.detail.id === id) {
        setHealth((h) => h - 25);
        setIsHit(true);
        setTimeout(() => setIsHit(false), 150);
      }
    };
    window.addEventListener("zombieHit", handleHit);
    return () => window.removeEventListener("zombieHit", handleHit);
  }, [id]);

  useFrame(() => {
    if (!rigidBody.current || health <= 0) return;

    // Move towards player (camera)
    const currentPos = rigidBody.current.translation();
    const playerPos = camera.position;
    
    const direction = new THREE.Vector3(playerPos.x - currentPos.x, 0, playerPos.z - currentPos.z);
    
    // Look at player
    const lookAtPos = new THREE.Vector3(playerPos.x, currentPos.y, playerPos.z);
    
    // Calculate rotation to look at player
    const targetRotation = Math.atan2(direction.x, direction.z);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
    rigidBody.current.setRotation(quaternion, true);

    if (direction.lengthSq() > 0.001) {
      direction.normalize();
    } else {
      direction.set(0, 0, 0);
    }
    
    const speed = 2.5;
    rigidBody.current.setLinvel({ 
      x: direction.x * speed, 
      y: rigidBody.current.linvel().y, 
      z: direction.z * speed 
    }, true);
  });

  if (health <= 0) return null;

  return (
    <RigidBody ref={rigidBody} userData={{ type: "zombie", id }} colliders={false} mass={1} position={position} type="dynamic" lockRotations>
      <CapsuleCollider args={[0.4, 0.5]} position={[0, 0, 0]} />
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.4, 1, 4, 8]} />
        <meshStandardMaterial color={isHit ? "#ff0000" : "#111111"} roughness={0.9} metalness={0.5} />
      </mesh>
      {/* Zombie Head/Eyes */}
      <mesh castShadow position={[0, 0.8, 0.2]}>
        <boxGeometry args={[0.3, 0.2, 0.3]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={isHit ? 5 : 2} />
      </mesh>
    </RigidBody>
  );
}

export default function ZombieSpawner() {
  const initialZombies = [
    { id: 1, position: [15, 5, 15] as [number, number, number] },
    { id: 2, position: [-15, 5, -10] as [number, number, number] },
    { id: 3, position: [10, 5, -20] as [number, number, number] },
    { id: 4, position: [-5, 5, 20] as [number, number, number] },
    { id: 5, position: [20, 5, -5] as [number, number, number] },
    { id: 6, position: [-20, 5, 5] as [number, number, number] },
  ];

  return (
    <>
      {initialZombies.map((z) => (
        <Zombie key={z.id} id={z.id} position={z.position} />
      ))}
    </>
  );
}
