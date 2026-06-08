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
  const { camera, scene } = useThree();
  const rigidBody = useRef<any>(null);
  
  const movementRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false
  });

  const [isShooting, setIsShooting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isAiming, setIsAiming] = useState(false);
  
  const isReloadingRef = useRef(false);
  const isAimingRef = useRef(false);
  const ammoRef = useRef(30);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": movementRef.current.forward = true; break;
        case "KeyS": movementRef.current.backward = true; break;
        case "KeyA": movementRef.current.left = true; break;
        case "KeyD": movementRef.current.right = true; break;
        case "Space": movementRef.current.jump = true; break;
        case "ShiftLeft": movementRef.current.sprint = true; break;
        case "KeyR": 
          if (!isReloadingRef.current && ammoRef.current < 30) {
            isReloadingRef.current = true;
            setIsReloading(true);
            setTimeout(() => { 
              ammoRef.current = 30;
              const hud = document.getElementById("ammo-hud");
              if (hud) hud.innerText = `30 / 30`;
              isReloadingRef.current = false;
              setIsReloading(false); 
            }, 2000); 
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": movementRef.current.forward = false; break;
        case "KeyS": movementRef.current.backward = false; break;
        case "KeyA": movementRef.current.left = false; break;
        case "KeyD": movementRef.current.right = false; break;
        case "Space": movementRef.current.jump = false; break;
        case "ShiftLeft": movementRef.current.sprint = false; break;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        isAimingRef.current = true;
        setIsAiming(true);
      }
      else if (e.button === 0 && !isReloadingRef.current && ammoRef.current > 0) {
        // Fire
        ammoRef.current -= 1;
        const hud = document.getElementById("ammo-hud");
        if (hud) hud.innerText = `${ammoRef.current} / 30`;

        setIsShooting(true);
        setTimeout(() => setIsShooting(false), 100);
        
        // Camera Recoil (FOV punch)
        camera.fov -= isAimingRef.current ? 1 : 2;
        camera.updateProjectionMatrix();

        // Raycast for hits using Three.js
        const raycaster = new THREE.Raycaster();
        const rayDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        raycaster.set(camera.position, rayDirection);
        
        const intersects = raycaster.intersectObjects(scene.children, true);
        for (let i = 0; i < intersects.length; i++) {
          const object = intersects[i].object;
          if (object.name && object.name.startsWith("zombie-")) {
            const id = parseInt(object.name.split("-")[1]);
            window.dispatchEvent(new CustomEvent("zombieHit", { detail: { id } }));
            
            // Hit marker
            const marker = document.getElementById("hit-marker");
            if (marker) {
              marker.style.opacity = "1";
              setTimeout(() => { marker.style.opacity = "0"; }, 100);
            }
            break; // Stop at first hit
          }
        }
      } else if (e.button === 0 && ammoRef.current <= 0 && !isReloadingRef.current) {
        // Auto reload
        isReloadingRef.current = true;
        setIsReloading(true);
        setTimeout(() => {
          ammoRef.current = 30;
          const hud = document.getElementById("ammo-hud");
          if (hud) hud.innerText = `30 / 30`;
          isReloadingRef.current = false;
          setIsReloading(false);
        }, 2000);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        isAimingRef.current = false;
        setIsAiming(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [camera, scene]);

  useFrame(() => {
    if (!rigidBody.current) return;

    // ADS Zoom smoothing
    const targetFov = isAimingRef.current ? 40 : 75;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.15);
    camera.updateProjectionMatrix();

    // Movement logic
    const velocity = rigidBody.current.linvel();
    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(0, 0, (movementRef.current.backward ? 1 : 0) - (movementRef.current.forward ? 1 : 0));
    const sideVector = new THREE.Vector3((movementRef.current.left ? 1 : 0) - (movementRef.current.right ? 1 : 0), 0, 0);

    const speed = isAimingRef.current ? SPEED * 0.5 : (movementRef.current.sprint ? SPRINT_SPEED : SPEED);

    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(speed)
      .applyEuler(camera.rotation);

    rigidBody.current.setLinvel({ x: direction.x, y: velocity.y, z: direction.z }, true);

    // Jump
    const worldPosition = rigidBody.current.translation();
    if (movementRef.current.jump && Math.abs(velocity.y) < 0.1) {
      rigidBody.current.setLinvel({ x: velocity.x, y: JUMP_FORCE, z: velocity.z }, true);
      movementRef.current.jump = false;
    }

    // Attach camera to rigid body
    camera.position.set(worldPosition.x, worldPosition.y + 0.8, worldPosition.z);
  });

  return (
    <>
      <RigidBody ref={rigidBody} colliders={false} mass={1} type="dynamic" position={[0, 5, 0]} lockRotations>
        <CapsuleCollider args={[0.5, 0.5]} />
      </RigidBody>
      <Weapon isShooting={isShooting} isReloading={isReloading} isAiming={isAiming} />
    </>
  );
}
