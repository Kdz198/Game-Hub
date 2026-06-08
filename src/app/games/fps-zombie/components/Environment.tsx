"use client";

import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";

export default function Environment() {
  return (
    <>
      {/* Ground */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -0.5, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[100, 1, 100]} />
          <meshStandardMaterial color="#303030" metalness={0.1} roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Some walls/obstacles */}
      <RigidBody type="fixed" colliders="cuboid" position={[10, 2, -10]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[5, 5, 2]} />
          <meshStandardMaterial color="#444444" roughness={0.7} metalness={0.2} />
        </mesh>
      </RigidBody>

      <RigidBody type="fixed" colliders="cuboid" position={[-8, 2, -15]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2, 4, 10]} />
          <meshStandardMaterial color="#554444" roughness={0.8} metalness={0.1} />
        </mesh>
      </RigidBody>
      
      <RigidBody type="fixed" colliders="cuboid" position={[0, 1, 10]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[10, 2, 2]} />
          <meshStandardMaterial color="#222222" roughness={0.5} metalness={0.5} />
        </mesh>
      </RigidBody>

      {/* Decorative Lights */}
      <pointLight position={[10, 3, -8]} color="#ff0000" intensity={2} distance={10} />
      <pointLight position={[-8, 3, -10]} color="#00ff00" intensity={1.5} distance={10} />
    </>
  );
}
