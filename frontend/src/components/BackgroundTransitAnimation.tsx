"use client";

import React from "react";

/**
 * BackgroundTransitAnimation
 *
 * A subtle, modern, 3D/isometric decorative background animation.
 * Features:
 * - A small electric transit bus moving smoothly along an ambient corridor path.
 * - A commuter/pedestrian walking along a transit sidewalk.
 * - Subtle 3D isometric perspective road grid and pulsing transit stop nodes.
 *
 * Strict Guardrails:
 * - Purely decorative (aria-hidden, pointer-events: none, z-index: 0).
 * - Low opacity to preserve high contrast and legibility.
 * - Zero interference with clicks, buttons, navigation, or page functionality.
 */
export function BackgroundTransitAnimation() {
  return (
    <div
      className="transit-bg-canvas"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
        opacity: 0.38,
        userSelect: "none",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          {/* Subtle gradients */}
          <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#0284c7" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.06" />
          </linearGradient>

          <linearGradient id="busBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          <linearGradient id="pedestrianGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>

          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 3D Perspective Grid Lines */}
        <g opacity="0.35" transform="matrix(1 0 -0.15 0.9 100 0)">
          <line x1="0" y1="180" x2="1440" y2="180" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="6 8" />
          <line x1="0" y1="360" x2="1440" y2="360" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="6 8" />
          <line x1="0" y1="540" x2="1440" y2="540" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="6 8" />
          <line x1="0" y1="720" x2="1440" y2="720" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="6 8" />

          <line x1="200" y1="0" x2="200" y2="900" stroke="#cbd5e1" strokeWidth="0.5" />
          <line x1="500" y1="0" x2="500" y2="900" stroke="#cbd5e1" strokeWidth="0.5" />
          <line x1="800" y1="0" x2="800" y2="900" stroke="#cbd5e1" strokeWidth="0.5" />
          <line x1="1100" y1="0" x2="1100" y2="900" stroke="#cbd5e1" strokeWidth="0.5" />
        </g>

        {/* Curved Transit Roadway with 3D Depth */}
        <path
          d="M -100,680 C 350,680 500,420 850,420 C 1200,420 1350,220 1600,220"
          fill="none"
          stroke="url(#roadGrad)"
          strokeWidth="36"
          strokeLinecap="round"
        />
        {/* Road Outer Edge */}
        <path
          d="M -100,662 C 350,662 500,402 850,402 C 1200,402 1350,202 1600,202"
          fill="none"
          stroke="#93c5fd"
          strokeWidth="1.2"
          opacity="0.5"
        />
        <path
          d="M -100,698 C 350,698 500,438 850,438 C 1200,438 1350,238 1600,238"
          fill="none"
          stroke="#93c5fd"
          strokeWidth="1.2"
          opacity="0.5"
        />
        {/* Road Center Dashed Guiding Line */}
        <path
          id="transitRoadPath"
          d="M -100,680 C 350,680 500,420 850,420 C 1200,420 1350,220 1600,220"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeDasharray="14 16"
          opacity="0.6"
          className="animated-road-dash"
        />

        {/* Parallel Pedestrian Sidewalk / Accessible Path */}
        <path
          id="pedestrianPath"
          d="M -80,725 C 360,725 510,465 860,465 C 1210,465 1360,265 1600,265"
          fill="none"
          stroke="#10b981"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          opacity="0.35"
        />

        {/* Ambient Transit Nodes with Pulse rings */}
        <g transform="translate(380, 560)">
          <circle r="14" fill="#3b82f6" opacity="0.12" className="transit-node-pulse" />
          <circle r="5" fill="#2563eb" opacity="0.7" />
          <circle r="2" fill="#ffffff" />
          <text x="12" y="4" fill="#64748b" fontSize="10" fontWeight="600" letterSpacing="0.05em">MMU STOP</text>
        </g>

        <g transform="translate(850, 420)">
          <circle r="16" fill="#3b82f6" opacity="0.12" className="transit-node-pulse" />
          <circle r="6" fill="#0284c7" opacity="0.7" />
          <circle r="2.5" fill="#ffffff" />
          <text x="12" y="4" fill="#64748b" fontSize="10" fontWeight="600" letterSpacing="0.05em">DPULZE HUB</text>
        </g>

        <g transform="translate(1220, 290)">
          <circle r="14" fill="#10b981" opacity="0.12" className="transit-node-pulse" />
          <circle r="5" fill="#059669" opacity="0.7" />
          <circle r="2" fill="#ffffff" />
          <text x="12" y="4" fill="#64748b" fontSize="10" fontWeight="600" letterSpacing="0.05em">CITY CENTRE MRT</text>
        </g>

        {/* Small Moving Bus (3D-styled isometric miniature) */}
        <g className="moving-bus-container">
          <g transform="translate(-24, -12)">
            {/* Bus Shadow */}
            <ellipse cx="24" cy="22" rx="26" ry="6" fill="#0f172a" opacity="0.25" />
            {/* Bus Main Hull */}
            <rect x="0" y="2" width="48" height="18" rx="5" fill="url(#busBodyGrad)" />
            {/* Roof Top / AC Pod */}
            <rect x="12" y="0" width="22" height="3" rx="1.5" fill="#60a5fa" opacity="0.9" />
            {/* Windshield & Windows */}
            <rect x="36" y="5" width="8" height="10" rx="2" fill="#e0f2fe" opacity="0.95" />
            <rect x="25" y="5" width="8" height="8" rx="1" fill="#bae6fd" opacity="0.85" />
            <rect x="14" y="5" width="8" height="8" rx="1" fill="#bae6fd" opacity="0.85" />
            <rect x="4" y="5" width="7" height="8" rx="1" fill="#bae6fd" opacity="0.85" />
            {/* Headlights */}
            <circle cx="47" cy="8" r="1.8" fill="#fef08a" filter="url(#softGlow)" />
            <circle cx="47" cy="14" r="1.8" fill="#fef08a" filter="url(#softGlow)" />
            {/* Taillights */}
            <circle cx="1" cy="8" r="1.2" fill="#ef4444" />
            <circle cx="1" cy="14" r="1.2" fill="#ef4444" />
            {/* Wheels */}
            <rect x="8" y="18" width="8" height="3" rx="1.5" fill="#1e293b" />
            <rect x="32" y="18" width="8" height="3" rx="1.5" fill="#1e293b" />
            {/* MonFate Line Badge */}
            <text x="24" y="12" fill="#ffffff" fontSize="5" fontWeight="800" textAnchor="middle">T504</text>
          </g>
        </g>

        {/* Moving Commuter / Person Walking on the Sidewalk */}
        <g className="moving-commuter-container">
          <g transform="translate(-10, -18)">
            {/* Commuter Shadow */}
            <ellipse cx="10" cy="19" rx="7" ry="2.5" fill="#0f172a" opacity="0.2" />
            {/* Head */}
            <circle cx="10" cy="4" r="3" fill="url(#pedestrianGrad)" />
            {/* Body */}
            <rect x="8" y="7" width="4" height="6.5" rx="1.5" fill="#059669" />
            {/* Walking Legs */}
            <line x1="9" y1="13.5" x2="7.5" y2="18" stroke="#047857" strokeWidth="1.5" strokeLinecap="round" className="pedestrian-leg-left" />
            <line x1="11" y1="13.5" x2="12.5" y2="18" stroke="#047857" strokeWidth="1.5" strokeLinecap="round" className="pedestrian-leg-right" />
            {/* Subtle cane / transit bag */}
            <line x1="11.5" y1="9" x2="14" y2="18" stroke="#94a3b8" strokeWidth="0.8" />
          </g>
        </g>
      </svg>
    </div>
  );
}
