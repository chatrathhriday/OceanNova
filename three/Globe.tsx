"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const ANOMALY_DOTS: { lat: number; lng: number; color: string }[] = [
  { lat: 35.2, lng: -152.4, color: "#FF6B6B" },
  { lat: 14.6, lng: 88.3, color: "#FFC857" },
  { lat: -58.4, lng: -62.1, color: "#FF6B6B" },
  { lat: -18.2, lng: 147.7, color: "#FFC857" },
  { lat: 16.9, lng: 63.2, color: "#00F5D4" },
  { lat: 68.1, lng: 2.4, color: "#00F5D4" },
  { lat: 27.3, lng: -90.5, color: "#FF6B6B" },
  { lat: 11.7, lng: 142.3, color: "#FFC857" },
  { lat: -33.9, lng: 18.4, color: "#00F5D4" },
  { lat: 52.0, lng: -30.0, color: "#7B61FF" },
];

function latLngToVec3(lat: number, lng: number, r: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

function GlobeMesh() {
  const group = useRef<THREE.Group>(null);
  const markersRef = useRef<THREE.Group>(null);

  const dotGeometry = useMemo(() => {
    const count = 900;
    const pos = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const theta = golden * i;
      pos[i * 3] = Math.cos(theta) * rad * 1.6;
      pos[i * 3 + 1] = y * 1.6;
      pos[i * 3 + 2] = Math.sin(theta) * rad * 1.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.16;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.08 + 0.22;
    }
    if (markersRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.12;
      markersRef.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={group}>
      {/* core glow sphere */}
      <mesh>
        <sphereGeometry args={[1.52, 32, 32]} />
        <meshBasicMaterial color="#0D2137" transparent opacity={0.92} />
      </mesh>
      {/* dotted surface */}
      <points geometry={dotGeometry}>
        <pointsMaterial size={0.022} color="#00BBF9" transparent opacity={0.75} sizeAttenuation />
      </points>
      {/* wireframe lat/long hint */}
      <mesh>
        <icosahedronGeometry args={[1.62, 1]} />
        <meshBasicMaterial color="#00F5D4" wireframe transparent opacity={0.10} />
      </mesh>
      {/* equator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.86, 0.004, 8, 90]} />
        <meshBasicMaterial color="#00F5D4" transparent opacity={0.35} />
      </mesh>
      {/* anomaly markers */}
      <group ref={markersRef}>
        {ANOMALY_DOTS.map((d, i) => {
          const p = latLngToVec3(d.lat, d.lng, 1.66);
          return (
            <group key={i} position={p}>
              <mesh>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial color={d.color} />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.09, 12, 12]} />
                <meshBasicMaterial color={d.color} transparent opacity={0.28} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

export default function Globe() {
  return (
    <Canvas
      dpr={[1, 1.6]}
      camera={{ position: [0, 0.4, 4.6], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <GlobeMesh />
    </Canvas>
  );
}
