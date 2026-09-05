"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * BackgroundTransitDecor — Premium Futuristic 3D Public Transport Animated Background.
 *
 * Visual Features:
 * - Stylized/realistic 3D Cyberjaya smart transit bus cruising along a futuristic corridor.
 * - Realistic rotating wheels, aerodynamic chassis, glossy panoramic windows, and illuminated rims.
 * - Soft volumetric forward headlight beams, ruby rear taillights, and neon underglow.
 * - Layered smart-city skyline silhouettes with window grids and beacon spires.
 * - Glowing transit highway guideway with animated light trails and roadside beacons.
 * - Elevated distant automated transit shuttle moving along a background guideway.
 * - Subtle floating ambient particles and atmospheric depth.
 *
 * Guardrails:
 * - Positioned strictly behind all UI (position: fixed, inset: 0, zIndex: 0).
 * - Strictly non-interactive (pointerEvents: none).
 * - Never obstructs or shifts any UI elements, buttons, cards, or text.
 * - Soft contrast/readability tint ensures all dashboard metrics and maps remain 100% legible.
 * - Automatically pauses / reduces motion if the user has `prefers-reduced-motion` enabled.
 * - Robust cleanup of geometries, materials, and animation frames on unmount.
 */
export function BackgroundTransitDecor() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Check for reduced motion preference
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdce7f2); // Soft ambient public transport sky tone
    scene.fog = new THREE.FogExp2(0xdce7f2, 0.012);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Camera with a cinematic perspective overlooking the corridor
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 300);
    camera.position.set(0, 10, 36);
    camera.lookAt(0, 3.5, 0);

    // Renderer
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      container.appendChild(renderer.domElement);
    } catch (e) {
      console.warn("[BackgroundTransitDecor] WebGL initialization fallback:", e);
      return;
    }

    // ==========================================
    // 1. LIGHTING
    // ==========================================
    const ambientLight = new THREE.AmbientLight(0xcfdbe8, 1.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(25, 40, 30);
    scene.add(sunLight);

    // Soft cyan smart-corridor rim light
    const corridorRimLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    corridorRimLight.position.set(-30, 20, -20);
    scene.add(corridorRimLight);

    // ==========================================
    // 2. MATERIALS PALETTE (Fitted to MonFate Theme)
    // ==========================================
    const busBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // Vibrant cobalt brand blue
      metalness: 0.65,
      roughness: 0.28,
    });

    const busDarkTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Deep slate navy
      metalness: 0.8,
      roughness: 0.35,
    });

    const windowGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0x93c5fd, // Glossy sky blue reflection
      metalness: 0.9,
      roughness: 0.12,
      transparent: true,
      opacity: 0.88,
    });

    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x60a5fa,
      emissiveIntensity: 3.0,
      roughness: 0.1,
    });

    const taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xd92d20,
      emissiveIntensity: 3.5,
      roughness: 0.2,
    });

    const routeSignMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 2.2,
    });

    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.1,
    });

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.95,
      roughness: 0.15,
    });

    const cyanNeonMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });

    // ==========================================
    // 3. 3D SMART CITY TRANSIT BUS MODEL
    // ==========================================
    const busGroup = new THREE.Group();
    const wheelsToRotate: THREE.Mesh[] = [];

    // Main Cabin Body
    const cabinGeo = new THREE.BoxGeometry(11.2, 3.4, 3.8);
    const cabinMesh = new THREE.Mesh(cabinGeo, busBodyMaterial);
    cabinMesh.position.y = 2.4;
    busGroup.add(cabinMesh);

    // Aerodynamic Lower Skirt / Chassis
    const skirtGeo = new THREE.BoxGeometry(11.4, 0.7, 3.86);
    const skirtMesh = new THREE.Mesh(skirtGeo, busDarkTrimMaterial);
    skirtMesh.position.y = 1.05;
    busGroup.add(skirtMesh);

    // Aerodynamic Front Nose Cap
    const noseGeo = new THREE.BoxGeometry(1.6, 2.6, 3.76);
    const noseMesh = new THREE.Mesh(noseGeo, busDarkTrimMaterial);
    noseMesh.position.set(5.8, 2.1, 0);
    busGroup.add(noseMesh);

    // Front Panoramic Windshield
    const windshieldGeo = new THREE.BoxGeometry(1.3, 2.0, 3.6);
    const windshieldMesh = new THREE.Mesh(windshieldGeo, windowGlassMaterial);
    windshieldMesh.position.set(5.6, 2.7, 0);
    busGroup.add(windshieldMesh);

    // Side Panoramic Window Ribbons (Left & Right)
    const sideWindowGeo = new THREE.BoxGeometry(8.6, 1.4, 0.08);

    const rightWindows = new THREE.Mesh(sideWindowGeo, windowGlassMaterial);
    rightWindows.position.set(0.2, 2.8, 1.91);
    busGroup.add(rightWindows);

    const leftWindows = new THREE.Mesh(sideWindowGeo, windowGlassMaterial);
    leftWindows.position.set(0.2, 2.8, -1.91);
    busGroup.add(leftWindows);

    // Roof Battery & Smart Telemetry Housing
    const roofPodGeo = new THREE.BoxGeometry(8.0, 0.5, 2.8);
    const roofPodMesh = new THREE.Mesh(roofPodGeo, busDarkTrimMaterial);
    roofPodMesh.position.set(-0.3, 4.3, 0);
    busGroup.add(roofPodMesh);

    // Roof Aerodynamic Accent Ribbons
    const roofRibbonGeo = new THREE.BoxGeometry(7.4, 0.12, 0.15);
    const roofRibbonRight = new THREE.Mesh(roofRibbonGeo, cyanNeonMaterial);
    roofRibbonRight.position.set(-0.3, 4.58, 1.25);
    busGroup.add(roofRibbonRight);

    const roofRibbonLeft = new THREE.Mesh(roofRibbonGeo, cyanNeonMaterial);
    roofRibbonLeft.position.set(-0.3, 4.58, -1.25);
    busGroup.add(roofRibbonLeft);

    // Illuminated Route HUD Sign Above Windshield
    const routeSignGeo = new THREE.BoxGeometry(0.12, 0.55, 2.6);
    const routeSignMesh = new THREE.Mesh(routeSignGeo, routeSignMaterial);
    routeSignMesh.position.set(6.3, 3.7, 0);
    busGroup.add(routeSignMesh);

    // Front High-Beam LED Light Strips
    const headlightGeo = new THREE.BoxGeometry(0.2, 0.35, 1.1);
    const rightHeadlight = new THREE.Mesh(headlightGeo, headlightMaterial);
    rightHeadlight.position.set(6.55, 1.5, 1.2);
    busGroup.add(rightHeadlight);

    const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMaterial);
    leftHeadlight.position.set(6.55, 1.5, -1.2);
    busGroup.add(leftHeadlight);

    // Volumetric Headlight Beams (Forward Light Projection)
    const beamGeo = new THREE.ConeGeometry(2.4, 18, 16, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const rightBeam = new THREE.Mesh(beamGeo, beamMaterial);
    rightBeam.rotation.z = -Math.PI / 2;
    rightBeam.position.set(15.2, 1.3, 1.2);
    busGroup.add(rightBeam);

    const leftBeam = new THREE.Mesh(beamGeo, beamMaterial);
    leftBeam.rotation.z = -Math.PI / 2;
    leftBeam.position.set(15.2, 1.3, -1.2);
    busGroup.add(leftBeam);

    // Rear High-Visibility LED Taillights
    const taillightGeo = new THREE.BoxGeometry(0.15, 0.45, 1.0);
    const rightTaillight = new THREE.Mesh(taillightGeo, taillightMaterial);
    rightTaillight.position.set(-5.65, 2.0, 1.3);
    busGroup.add(rightTaillight);

    const leftTaillight = new THREE.Mesh(taillightGeo, taillightMaterial);
    leftTaillight.position.set(-5.65, 2.0, -1.3);
    busGroup.add(leftTaillight);

    // Wheels Construction (Front & Rear Pairs)
    const wheelPositions = [
      { x: 3.8, z: 1.85 },
      { x: 3.8, z: -1.85 },
      { x: -3.6, z: 1.85 },
      { x: -3.6, z: -1.85 },
    ];

    const wheelTireGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.55, 24);
    const wheelRimGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.58, 16);
    const wheelNeonGeo = new THREE.TorusGeometry(0.56, 0.035, 8, 20);

    wheelPositions.forEach((pos) => {
      const wheelAssembly = new THREE.Group();

      const tire = new THREE.Mesh(wheelTireGeo, tireMaterial);
      tire.rotation.x = Math.PI / 2;
      wheelAssembly.add(tire);

      const rim = new THREE.Mesh(wheelRimGeo, rimMaterial);
      rim.rotation.x = Math.PI / 2;
      wheelAssembly.add(rim);

      const neonRing = new THREE.Mesh(wheelNeonGeo, cyanNeonMaterial);
      wheelAssembly.add(neonRing);

      wheelAssembly.position.set(pos.x, 0.9, pos.z);
      busGroup.add(wheelAssembly);
      wheelsToRotate.push(tire);
    });

    // Soft Cyan Ground Underglow
    const underglowGeo = new THREE.PlaneGeometry(10.5, 3.4);
    const underglowMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
    underglowMesh.rotation.x = Math.PI / 2;
    underglowMesh.position.y = 0.08;
    busGroup.add(underglowMesh);

    // Initial bus placement on highway
    busGroup.position.set(-36, 0, 0);
    scene.add(busGroup);

    // ==========================================
    // 4. TRANSIT HIGHWAY & ROADWAY INFRASTRUCTURE
    // ==========================================
    const roadGroup = new THREE.Group();

    // Main road plane
    const roadGeo = new THREE.PlaneGeometry(180, 24);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xb8c9dc,
      roughness: 0.6,
      metalness: 0.25,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0, 0);
    roadGroup.add(roadMesh);

    // Roadside Curb Rails (Left & Right)
    const curbGeo = new THREE.BoxGeometry(180, 0.25, 0.4);
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const rightCurb = new THREE.Mesh(curbGeo, curbMat);
    rightCurb.position.set(0, 0.12, 11.5);
    roadGroup.add(rightCurb);

    const leftCurb = new THREE.Mesh(curbGeo, curbMat);
    leftCurb.position.set(0, 0.12, -11.5);
    roadGroup.add(leftCurb);

    // Road Neon Divider Dash Marks
    const dashGroup = new THREE.Group();
    const dashGeo = new THREE.PlaneGeometry(3.6, 0.25);
    const dashMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.7,
    });

    for (let x = -88; x <= 88; x += 9) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, 0);
      dashGroup.add(dash);
    }
    roadGroup.add(dashGroup);

    // Cyber Smart-Corridor Roadside Beacons
    const beaconGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.4, 12);
    const beaconLightGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const beaconPostMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const beaconLightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    for (let x = -80; x <= 80; x += 18) {
      const post = new THREE.Mesh(beaconGeo, beaconPostMat);
      post.position.set(x, 1.2, 11.2);
      roadGroup.add(post);

      const lamp = new THREE.Mesh(beaconLightGeo, beaconLightMat);
      lamp.position.set(x, 2.4, 11.2);
      roadGroup.add(lamp);
    }

    scene.add(roadGroup);

    // ==========================================
    // 5. DISTANT SMART CITY SKYLINE SILHOUETTES
    // ==========================================
    const skylineGroup = new THREE.Group();
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0xaec3d8,
      roughness: 0.45,
      metalness: 0.35,
    });

    const windowGlowMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.75,
    });

    const spireBeaconMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
    });

    const buildingDefs = [
      { x: -75, w: 9, h: 26, d: 8, z: -35 },
      { x: -58, w: 12, h: 36, d: 10, z: -40 },
      { x: -42, w: 8, h: 22, d: 7, z: -32 },
      { x: -28, w: 14, h: 44, d: 12, z: -45 },
      { x: -12, w: 10, h: 30, d: 9, z: -36 },
      { x: 3, w: 16, h: 48, d: 12, z: -48 },
      { x: 22, w: 11, h: 34, d: 8, z: -38 },
      { x: 38, w: 8, h: 24, d: 7, z: -30 },
      { x: 54, w: 15, h: 40, d: 11, z: -44 },
      { x: 72, w: 10, h: 28, d: 9, z: -35 },
    ];

    buildingDefs.forEach((b) => {
      const bGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const bMesh = new THREE.Mesh(bGeo, buildingMat);
      bMesh.position.set(b.x, b.h / 2, b.z);
      skylineGroup.add(bMesh);

      // Add a couple glowing horizontal window strips
      for (let yOffset = 6; yOffset < b.h - 4; yOffset += 5) {
        const stripGeo = new THREE.BoxGeometry(b.w * 0.78, 0.35, b.d + 0.15);
        const stripMesh = new THREE.Mesh(stripGeo, windowGlowMat);
        stripMesh.position.set(b.x, yOffset, b.z);
        skylineGroup.add(stripMesh);
      }

      // Rooftop Spire & Aviation Beacon on Tallest Towers
      if (b.h >= 34) {
        const spireGeo = new THREE.CylinderGeometry(0.15, 0.4, 7, 8);
        const spireMesh = new THREE.Mesh(spireGeo, buildingMat);
        spireMesh.position.set(b.x, b.h + 3.5, b.z);
        skylineGroup.add(spireMesh);

        const beaconGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const beaconMesh = new THREE.Mesh(beaconGeo, spireBeaconMat);
        beaconMesh.position.set(b.x, b.h + 7.2, b.z);
        skylineGroup.add(beaconMesh);
      }
    });

    scene.add(skylineGroup);

    // ==========================================
    // 6. SECONDARY DISTANT ELEVATED TRANSIT POD
    // ==========================================
    const elevatedRailGroup = new THREE.Group();

    // Rail Track Beam
    const railBeamGeo = new THREE.BoxGeometry(180, 0.6, 1.4);
    const railBeamMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.7,
      roughness: 0.3,
    });
    const railBeam = new THREE.Mesh(railBeamGeo, railBeamMat);
    railBeam.position.set(0, 11, -20);
    elevatedRailGroup.add(railBeam);

    // Rail Neon Accent
    const railNeonGeo = new THREE.BoxGeometry(180, 0.1, 0.1);
    const railNeon = new THREE.Mesh(railNeonGeo, cyanNeonMaterial);
    railNeon.position.set(0, 11.35, -19.3);
    elevatedRailGroup.add(railNeon);

    // Secondary Autonomous Shuttle Pod
    const shuttlePodGroup = new THREE.Group();
    const podBodyGeo = new THREE.BoxGeometry(7.2, 2.0, 2.2);
    const podBodyMat = new THREE.MeshStandardMaterial({
      color: 0x059669, // Emerald green clean transit
      metalness: 0.7,
      roughness: 0.3,
    });
    const podMesh = new THREE.Mesh(podBodyGeo, podBodyMat);
    shuttlePodGroup.add(podMesh);

    const podWindowGeo = new THREE.BoxGeometry(5.6, 0.9, 2.26);
    const podWindow = new THREE.Mesh(podWindowGeo, windowGlassMaterial);
    shuttlePodGroup.add(podWindow);

    shuttlePodGroup.position.set(20, 12.3, -20);
    elevatedRailGroup.add(shuttlePodGroup);

    scene.add(elevatedRailGroup);

    // ==========================================
    // 7. HIGH-SPEED LIGHT TRAILS & DATA PARTICLES
    // ==========================================
    const particleCount = 140;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePos[i] = (Math.random() - 0.5) * 110;
      particlePos[i + 1] = Math.random() * 24 + 1;
      particlePos[i + 2] = (Math.random() - 0.5) * 40 - 5;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.45,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // Streamline Glowing Light Trail Line
    const trailGeo = new THREE.BoxGeometry(22, 0.12, 0.12);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.5,
    });
    const trail1 = new THREE.Mesh(trailGeo, trailMat);
    trail1.position.set(-10, 0.4, 5.5);
    scene.add(trail1);

    const trail2 = new THREE.Mesh(trailGeo, trailMat);
    trail2.position.set(25, 0.4, -5.5);
    scene.add(trail2);

    // ==========================================
    // 8. RESIZE & CLEANUP LOGIC
    // ==========================================
    const handleResize = () => {
      if (!container || !renderer) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // ==========================================
    // 9. SMOOTH ANIMATION LOOP
    // ==========================================
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // If user prefers reduced motion, render a clean still frame
      if (prefersReducedMotion) {
        busGroup.position.set(0, 0, 0);
        renderer?.render(scene, camera);
        return;
      }

      // Smooth horizontal travel for main smart transit bus
      const busSpeed = 8.5; // units per second
      busGroup.position.x += busSpeed * delta;

      // Realistic suspension micro-bobbing
      busGroup.position.y = Math.sin(time * 3.5) * 0.04;
      busGroup.rotation.z = Math.sin(time * 3.5) * 0.003;

      // Rotate wheels smoothly with ground velocity
      wheelsToRotate.forEach((wheel) => {
        wheel.rotation.z -= (busSpeed / 0.9) * delta;
      });

      // Seamless horizon loop: wrap around when past screen boundary
      if (busGroup.position.x > 48) {
        busGroup.position.x = -48;
      }

      // Secondary shuttle moves in reverse on elevated guideway
      shuttlePodGroup.position.x -= 12.0 * delta;
      if (shuttlePodGroup.position.x < -60) {
        shuttlePodGroup.position.x = 60;
      }

      // Move light trails
      trail1.position.x += 14 * delta;
      if (trail1.position.x > 60) trail1.position.x = -60;

      trail2.position.x += 16 * delta;
      if (trail2.position.x > 60) trail2.position.x = -60;

      // Gentle floating particle motion
      particleSystem.rotation.y = time * 0.015;

      // Camera subtle breathing parallax
      camera.position.x = Math.sin(time * 0.25) * 1.8;
      camera.position.y = 10 + Math.sin(time * 0.35) * 0.6;
      camera.lookAt(0, 3.5, 0);

      renderer?.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);

      // Thorough WebGL disposal
      if (renderer && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
        renderer.dispose();
      }

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    };
  }, []);

  return (
    <div
      className="citizen-3d-background-layer"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
          opacity: 0.72,
        }}
      />

      {/* Subtle atmospheric gradient overlay to guarantee perfect readability of existing UI */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(238, 242, 246, 0.42) 0%, rgba(238, 242, 246, 0.18) 45%, rgba(238, 242, 246, 0.58) 100%)",
          backdropFilter: "blur(1px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
