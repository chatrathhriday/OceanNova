"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/* ════════════════════════  WATER SHADER  ════════════════════════ */

const waterVertex = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uMouseStrength;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vH;

  float waveH(vec2 p, float t) {
    float h = 0.0;
    h += sin(p.x * 0.16 + t * 0.80) * 0.42;
    h += sin(p.y * 0.21 - t * 0.62) * 0.34;
    h += sin((p.x + p.y) * 0.09 + t * 0.45) * 0.52;
    h += sin(length(p) * 0.055 - t * 0.50) * 0.30;
    h += sin(p.x * 0.55 + p.y * 0.35 + t * 1.40) * 0.08;
    return h;
  }

  float mouseRipple(vec2 p, float t) {
    float d = length(p - uMouse);
    return sin(d * 2.4 - t * 5.2) * exp(-d * 0.28) * uMouseStrength;
  }

  float totalH(vec2 p, float t) {
    return waveH(p, t) + mouseRipple(p, t);
  }

  void main() {
    vec3 pos = position;
    vec4 wp4 = modelMatrix * vec4(pos, 1.0);
    vec2 wxz = wp4.xz;
    float t = uTime;

    float h = totalH(wxz, t);
    float eps = 0.35;
    float hx = totalH(wxz + vec2(eps, 0.0), t);
    float hz = totalH(wxz + vec2(0.0, eps), t);

    pos.y += h;
    vec3 n = normalize(vec3(-(hx - h) / eps, 1.0, -(hz - h) / eps));

    vNormal = normalize(normalMatrix * n);
    vH = h;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const waterFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vH;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);
    float t = uTime;

    // base: abyssal navy -> deep ocean, lifted on crests
    vec3 deep = vec3(0.024, 0.062, 0.118);
    vec3 mid  = vec3(0.051, 0.129, 0.216);
    float crest = smoothstep(-0.6, 1.1, vH);
    vec3 col = mix(deep, mid, crest * 0.85);

    // teal tint on wave faces
    col = mix(col, vec3(0.0, 0.35, 0.38), crest * 0.22 * max(n.y, 0.0));

    // fresnel rim — bioluminescent cyan at grazing angles
    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    col += vec3(0.0, 0.96, 0.83) * fres * 0.42;
    col += vec3(0.0, 0.73, 0.98) * pow(fres, 5.0) * 0.5;

    // specular sun glints
    vec3 lightDir = normalize(vec3(0.35, 0.85, 0.30));
    float spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 110.0);
    col += vec3(0.94, 0.99, 1.0) * spec * 0.85;

    // caustic sparkle
    float sp = 0.5 + 0.5 * sin(vWorldPos.x * 3.6 + t * 2.6) * sin(vWorldPos.z * 4.2 - t * 1.9);
    col += vec3(0.35, 1.0, 0.92) * pow(sp, 9.0) * 0.10;

    // bioluminescent blooms drifting below surface
    vec2 g1 = vec2(sin(t * 0.21) * 9.0, -7.0 + cos(t * 0.27) * 5.0);
    vec2 g2 = vec2(-6.0 + cos(t * 0.16) * 6.0, sin(t * 0.22) * 8.0 - 14.0);
    vec2 g3 = vec2(8.0 + sin(t * 0.13) * 5.0, -20.0 + cos(t * 0.18) * 6.0);
    float d1 = length(vWorldPos.xz - g1);
    float d2 = length(vWorldPos.xz - g2);
    float d3 = length(vWorldPos.xz - g3);
    col += vec3(0.0, 0.96, 0.83) * 0.16 * exp(-d1 * 0.10);
    col += vec3(0.48, 0.38, 1.0) * 0.13 * exp(-d2 * 0.09);
    col += vec3(0.0, 0.73, 0.98) * 0.12 * exp(-d3 * 0.08);

    // foam wisps on highest crests
    float foam = smoothstep(0.95, 1.35, vH) * (0.5 + 0.5 * sin(vWorldPos.x * 8.0 + vWorldPos.z * 6.0 + t * 3.0));
    col += vec3(0.75, 0.95, 1.0) * foam * 0.10;

    // fade to transparent distance so CSS abyss gradient shows through
    float alpha = 1.0 - smoothstep(20.0, 52.0, dist) * 0.96;
    // slight height-based transparency on troughs for depth
    alpha *= 0.96;

    gl_FragColor = vec4(col, alpha);
  }
`;

/* ════════════════════════  PARTICLE SHADERS  ════════════════════════ */

const pointsVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aRand;
  varying float vRand;
  varying float vFade;
  void main() {
    vRand = aRand;
    vec3 p = position;
    p.y += sin(uTime * 0.35 + aRand * 6.2831) * 0.55;
    p.x += sin(uTime * 0.22 + aRand * 12.0) * 0.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (120.0 / max(1.0, -mv.z));
    vFade = smoothstep(60.0, 18.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const pointsFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying float vRand;
  varying float vFade;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);
    vec3 cyan = vec3(0.0, 0.96, 0.83);
    vec3 teal = vec3(0.0, 0.73, 0.98);
    vec3 purple = vec3(0.48, 0.38, 1.0);
    vec3 col = vRand < 0.55 ? cyan : (vRand < 0.85 ? teal : purple);
    float tw = 0.55 + 0.45 * sin(uTime * 1.6 + vRand * 20.0);
    gl_FragColor = vec4(col, a * vFade * 0.5 * tw);
  }
`;

const bubblesVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aSpeed;
  attribute float aRand;
  varying float vA;
  void main() {
    vec3 p = position;
    float range = 9.0;
    float y = mod(p.y + uTime * aSpeed, range) - 2.0;
    p.y = y;
    p.x += sin(uTime * 0.9 + aRand * 6.2831 + y) * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (100.0 / max(1.0, -mv.z));
    vA = smoothstep(-2.0, -0.5, y) * smoothstep(7.0, 5.0, y);
    gl_Position = projectionMatrix * mv;
  }
`;

const bubblesFragment = /* glsl */ `
  precision highp float;
  varying float vA;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float ring = smoothstep(0.5, 0.34, d) * smoothstep(0.18, 0.34, d);
    float core = smoothstep(0.15, 0.0, d) * 0.5;
    gl_FragColor = vec4(vec3(0.72, 0.98, 1.0), (ring + core) * vA * 0.6);
  }
`;

const rayVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rayFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
    float vert = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
    float stripes = 0.6 + 0.4 * sin(vUv.x * 22.0 + uSeed * 10.0 + uTime * 0.35);
    float flicker = 0.7 + 0.3 * sin(uTime * 0.5 + uSeed * 6.2831);
    gl_FragColor = vec4(vec3(0.29, 0.94, 0.89), edge * vert * stripes * flicker * 0.10);
  }
`;

/* ════════════════════════  COMPONENTS  ════════════════════════ */

function Water() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mouseTarget = useRef(new THREE.Vector2(999, 999));
  const mouseCurrent = useRef(new THREE.Vector2(999, 999));
  const strength = useRef(0);
  const strengthTarget = useRef(0);
  const { camera } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uMouseStrength: { value: 0 },
    }),
    []
  );

  // convert screen pointer to y=0 plane intersection (world xz)
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) {
        mouseTarget.current.set(hit.x, hit.z);
        strengthTarget.current = 0.9;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [camera]);

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const t = state.clock.elapsedTime;
    (mat.uniforms.uTime as { value: number }).value = t;
    mouseCurrent.current.lerp(mouseTarget.current, 1 - Math.pow(0.001, delta));
    strengthTarget.current = Math.max(0.08, strengthTarget.current - delta * 0.18);
    strength.current += (strengthTarget.current - strength.current) * Math.min(1, delta * 3);
    (mat.uniforms.uMouse as { value: THREE.Vector2 }).value.copy(mouseCurrent.current);
    (mat.uniforms.uMouseStrength as { value: number }).value = strength.current;
  });

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(110, 70, 210, 140);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, -12]}>
      <shaderMaterial
        ref={matRef}
        vertexShader={waterVertex}
        fragmentShader={waterFragment}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Plankton() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const count = 480;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 56;
      pos[i * 3 + 1] = Math.random() * 7 - 1;
      pos[i * 3 + 2] = -Math.random() * 42 + 4;
      size[i] = 0.5 + Math.random() * 1.6;
      rand[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    return {
      geometry: g,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
      },
    };
  }, []);

  useFrame((state) => {
    if (matRef.current) (matRef.current.uniforms.uTime as { value: number }).value = state.clock.elapsedTime;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={pointsVertex}
        fragmentShader={pointsFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Bubbles() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const count = 170;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const speed = new Float32Array(count);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = -Math.random() * 30 + 3;
      size[i] = 0.4 + Math.random() * 1.0;
      speed[i] = 0.35 + Math.random() * 0.7;
      rand[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    return {
      geometry: g,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
      },
    };
  }, []);

  useFrame((state) => {
    if (matRef.current) (matRef.current.uniforms.uTime as { value: number }).value = state.clock.elapsedTime;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={bubblesVertex}
        fragmentShader={bubblesFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function GodRays() {
  const group = useRef<THREE.Group>(null);
  const mats = useRef<THREE.ShaderMaterial[]>([]);
  const rays = useMemo(
    () => [
      { x: -14, z: -30, rot: 0.28, w: 7, h: 34, seed: 0.2 },
      { x: -6, z: -34, rot: 0.18, w: 10, h: 40, seed: 0.7 },
      { x: 4, z: -32, rot: -0.12, w: 8, h: 38, seed: 1.3 },
      { x: 13, z: -28, rot: -0.3, w: 6, h: 30, seed: 1.9 },
    ],
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    mats.current.forEach((m, i) => {
      (m.uniforms.uTime as { value: number }).value = t;
    });
    if (group.current) {
      group.current.rotation.z = Math.sin(t * 0.1) * 0.03;
    }
  });

  return (
    <group ref={group}>
      {rays.map((r, i) => (
        <mesh key={i} position={[r.x, 10, r.z]} rotation={[0, 0, r.rot]}>
          <planeGeometry args={[r.w, r.h]} />
          <shaderMaterial
            ref={(m) => {
              if (m) mats.current[i] = m;
            }}
            vertexShader={rayVertex}
            fragmentShader={rayFragment}
            uniforms={{ uTime: { value: 0 }, uSeed: { value: r.seed } }}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig() {
  const { camera } = useThree();
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const k = 1 - Math.pow(0.02, delta);
    camera.position.x += (pointer.current.x * 1.5 - camera.position.x) * k;
    camera.position.y += (2.6 + pointer.current.y * 0.5 + Math.sin(t * 0.28) * 0.16 - camera.position.y) * k;
    camera.position.z = 8.6 + Math.sin(t * 0.16) * 0.3;
    camera.lookAt(0, 0.5, -10);
  });
  return null;
}

export default function OceanScene() {
  return (
    <Canvas
      dpr={[1, 1.8]}
      camera={{ position: [0, 2.6, 8.6], fov: 55, near: 0.1, far: 160 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        stencil: false,
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <CameraRig />
      <Water />
      <Plankton />
      <Bubbles />
      <GodRays />
    </Canvas>
  );
}
