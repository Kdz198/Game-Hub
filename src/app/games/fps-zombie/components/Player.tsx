"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider, useRapier } from "@react-three/rapier";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Weapon from "./Weapon";

const SPEED = 6;
const SPRINT_SPEED = 10;
const JUMP_FORCE = 8;

export default function Player() {
  const { camera } = useThree();
  const rigidBody = useRef<any>(null);
  
  const { rapier, world } = useRapier();
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false
  });

  const [isShooting, setIsShooting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const ammoRef = useRef(30);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": setMovement((m) => ({ ...m, forward: true })); break;
        case "KeyS": setMovement((m) => ({ ...m, backward: true })); break;
        case "KeyA": setMovement((m) => ({ ...m, left: true })); break;
        case "KeyD": setMovement((m) => ({ ...m, right: true })); break;
        case "Space": setMovement((m) => ({ ...m, jump: true })); break;
        case "ShiftLeft": setMovement((m) => ({ ...m, sprint: true })); break;
        case "KeyR": 
          if (!isReloading && ammoRef.current < 30) {
            setIsReloading(true); 
            setTimeout(() => { 
              ammoRef.current = 30;
              const hud = document.getElementById("ammo-hud");
              if (hud) hud.innerText = `30 / 30`;
              setIsReloading(false); 
            }, 2000); 
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": setMovement((m) => ({ ...m, forward: false })); break;
        case "KeyS": setMovement((m) => ({ ...m, backward: false })); break;
        case "KeyA": setMovement((m) => ({ ...m, left: false })); break;
        case "KeyD": setMovement((m) => ({ ...m, right: false })); break;
        case "Space": setMovement((m) => ({ ...m, jump: false })); break;
        case "ShiftLeft": setMovement((m) => ({ ...m, sprint: false })); break;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && !isReloading && ammoRef.current > 0) {
        // Fire
        ammoRef.current -= 1;
        const hud = document.getElementById("ammo-hud");
        if (hud) hud.innerText = `${ammoRef.current} / 30`;

        setIsShooting(true);
        setTimeout(() => setIsShooting(false), 100);
        
        // Raycast for hits
        const rayOrigin = camera.position;
        const rayDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const ray = new rapier.Ray(rayOrigin, rayDirection);
        const hit = world.castRay(ray, 100, true);
        
        if (hit && hit.collider) {
          const body = hit.collider.parent();
          if (body && body.userData && body.userData.type === "zombie") {
            window.dispatchEvent(new CustomEvent("zombieHit", { detail: { id: body.userData.id } }));
            
            // Hit marker
            const marker = document.getElementById("hit-marker");
            if (marker) {
              marker.style.opacity = "1";
              setTimeout(() => { marker.style.opacity = "0"; }, 100);
            }
          }
        }
      } else if (e.button === 0 && ammoRef.current <= 0 && !isReloading) {
        // Auto reload
        setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = 30;
          const hud = document.getElementById("ammo-hud");
          if (hud) hud.innerText = `30 / 30`;
          setIsReloading(false);
        }, 2000);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousedown", handleMouseDown);
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [camera, isReloading, rapier, world]);

  useFrame(() => {
    if (!rigidBody.current) return;

    // Movement logic
    const velocity = rigidBody.current.linvel();
    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(0, 0, (movement.backward ? 1 : 0) - (movement.forward ? 1 : 0));
    const sideVector = new THREE.Vector3((movement.left ? 1 : 0) - (movement.right ? 1 : 0), 0, 0);

    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(movement.sprint ? SPRINT_SPEED : SPEED)
      .applyEuler(camera.rotation);

    rigidBody.current.setLinvel({ x: direction.x, y: velocity.y, z: direction.z }, true);

    // Jump
    const worldPosition = rigidBody.current.translation();
    if (movement.jump && Math.abs(velocity.y) < 0.1) {
      rigidBody.current.setLinvel({ x: velocity.x, y: JUMP_FORCE, z: velocity.z }, true);
      setMovement((m) => ({ ...m, jump: false }));
    }

    // Attach camera to rigid body
    camera.position.set(worldPosition.x, worldPosition.y + 0.8, worldPosition.z);
  });

  return (
    <>
      <RigidBody ref={rigidBody} colliders={false} mass={1} type="dynamic" position={[0, 5, 0]} lockRotations>
        <CapsuleCollider args={[0.5, 0.5]} />
      </RigidBody>
      <Weapon isShooting={isShooting} isReloading={isReloading} />
    </>
  );
}
