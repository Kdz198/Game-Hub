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
  const [bloodParticles, setBloodParticles] = useState<{ id: number; position: [number, number, number] }[]>([]);

  // Animation Refs
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const handleHit = (e: any) => {
      if (e.detail.id === id) {
        setHealth((h) => h - 25);
        setIsHit(true);
        setTimeout(() => setIsHit(false), 150);

        // Spawn blood particles
        if (rigidBody.current) {
          const pos = rigidBody.current.translation();
          const newParticles = Array.from({ length: 5 }).map((_, i) => ({
            id: Date.now() + i,
            position: [pos.x + (Math.random() - 0.5), pos.y + 0.5 + Math.random(), pos.z + (Math.random() - 0.5)] as [number, number, number]
          }));
          setBloodParticles((prev) => [...prev, ...newParticles]);
          setTimeout(() => {
            setBloodParticles((prev) => prev.filter(p => !newParticles.find(n => n.id === p.id)));
          }, 500); // Remove particles after 0.5s
        }
      }
    };
    window.addEventListener("zombieHit", handleHit);
    return () => window.removeEventListener("zombieHit", handleHit);
  }, [id]);

  useFrame((state) => {
    if (!rigidBody.current || health <= 0) return;

    // Move towards player (camera)
    const currentPos = rigidBody.current.translation();
    const playerPos = camera.position;
    
    const direction = new THREE.Vector3(playerPos.x - currentPos.x, 0, playerPos.z - currentPos.z);
    
    // Look at player
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

    // Walking Animation
    const time = state.clock.getElapsedTime();
    const animSpeed = 10;
    
    if (leftArmRef.current && rightArmRef.current && leftLegRef.current && rightLegRef.current) {
      // Zombie pose: arms forward (approx 1.5 rad) + slight swing
      leftArmRef.current.rotation.x = Math.sin(time * animSpeed) * 0.2 + 1.4;
      rightArmRef.current.rotation.x = -Math.sin(time * animSpeed) * 0.2 + 1.4;
      
      // Legs swinging
      leftLegRef.current.rotation.x = -Math.sin(time * animSpeed) * 0.5;
      rightLegRef.current.rotation.x = Math.sin(time * animSpeed) * 0.5;
    }
  });

  if (health <= 0) return null;

  const skinColor = isHit ? "#ff0000" : "#2d4c1e";
  const clothesColor = isHit ? "#ff0000" : "#3a4c5e";

  return (
    <>
      <RigidBody ref={rigidBody} userData={{ type: "zombie", id }} colliders={false} mass={1} position={position} type="dynamic" lockRotations>
        <CapsuleCollider args={[0.5, 0.5]} position={[0, 0, 0]} />
        
        {/* Body Container (Pivot at center) */}
        <group position={[0, -0.2, 0]}>
          
          {/* Torso */}
          <mesh name={`zombie-${id}`} castShadow receiveShadow position={[0, 0.3, 0]}>
            <boxGeometry args={[0.4, 0.6, 0.2]} />
            <meshStandardMaterial color={clothesColor} roughness={0.9} />
          </mesh>

          {/* Head */}
          <mesh name={`zombie-${id}`} castShadow receiveShadow position={[0, 0.75, 0]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color={skinColor} roughness={0.9} />
          </mesh>
          {/* Glowing Eyes */}
          <mesh position={[0.06, 0.75, 0.16]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={isHit ? 10 : 2} />
          </mesh>
          <mesh position={[-0.06, 0.75, 0.16]}>
            <boxGeometry args={[0.05, 0.05, 0.01]} />
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={isHit ? 10 : 2} />
          </mesh>

          {/* Left Arm Pivot */}
          <group ref={leftArmRef} position={[0.25, 0.55, 0]}>
            <mesh name={`zombie-${id}`} castShadow receiveShadow position={[0, -0.25, 0]}>
              <boxGeometry args={[0.12, 0.5, 0.12]} />
              <meshStandardMaterial color={skinColor} roughness={0.9} />
            </mesh>
          </group>

          {/* Right Arm Pivot */}
          <group ref={rightArmRef} position={[-0.25, 0.55, 0]}>
            <mesh name={`zombie-${id}`} castShadow receiveShadow position={[0, -0.25, 0]}>
              <boxGeometry args={[0.12, 0.5, 0.12]} />
              <meshStandardMaterial color={skinColor} roughness={0.9} />
            </mesh>
          </group>

          {/* Left Leg Pivot */}
          <group ref={leftLegRef} position={[0.12, 0, 0]}>
            <mesh name={`zombie-${id}`} castShadow receiveShadow position={[0, -0.3, 0]}>
              <boxGeometry args={[0.15, 0.6, 0.15]} />
              <meshStandardMaterial color={clothesColor} roughness={0.9} />
            </mesh>
          </group>

          {/* Right Leg Pivot */}
          <group ref={rightLegRef} position={[-0.12, 0, 0]}>
            <mesh name={`zombie-${id}`} castShadow receiveShadow position={[0, -0.3, 0]}>
              <boxGeometry args={[0.15, 0.6, 0.15]} />
              <meshStandardMaterial color={clothesColor} roughness={0.9} />
            </mesh>
          </group>

        </group>
      </RigidBody>

      {/* Blood Particles */}
      {bloodParticles.map((p) => (
        <mesh key={p.id} position={p.position}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial color="#880000" emissive="#aa0000" />
        </mesh>
      ))}
    </>
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
