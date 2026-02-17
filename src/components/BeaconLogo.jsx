import React from 'react';

// Simple animated beacon logo - matches your blue color scheme
function BeaconLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 70 70" style={{ flexShrink: 0 }}>
      {/* Animated outer rings */}
      <circle cx="35" cy="35" r="30" fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.2">
        <animate attributeName="r" values="30;32;30" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0.1;0.2" dur="3s" repeatCount="indefinite" />
      </circle>
      
      <circle cx="35" cy="35" r="24" fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.3">
        <animate attributeName="r" values="24;26;24" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.15;0.3" dur="2.5s" repeatCount="indefinite" />
      </circle>
      
      <circle cx="35" cy="35" r="18" fill="none" stroke="#60a5fa" strokeWidth="2.5" opacity="0.5">
        <animate attributeName="r" values="18;20;18" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.3;0.5" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Rotating sweep line */}
      <g>
        <line x1="35" y1="35" x2="62" y2="17" stroke="#f59e0b" strokeWidth="3" opacity="0.7" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 35 35" to="360 35 35" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0.4;0.7" dur="2s" repeatCount="indefinite" />
        </line>
      </g>

      {/* Pulse dots */}
      <g>
        <circle cx="52" cy="21" r="4" fill="#fbbf24">
          <animate attributeName="r" values="4;5;4" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="52" cy="21" r="7" fill="#f59e0b" opacity="0.3">
          <animate attributeName="r" values="7;10;7" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </g>

      <circle cx="21" cy="52" r="3" fill="#60a5fa" opacity="0.8">
        <animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite" />
      </circle>
      
      <circle cx="49" cy="49" r="2.5" fill="#3b82f6" opacity="0.6">
        <animate attributeName="r" values="2.5;3.5;2.5" dur="1.8s" repeatCount="indefinite" />
      </circle>

      {/* Center beacon */}
      <circle cx="35" cy="35" r="9" fill="#f59e0b">
        <animate attributeName="r" values="9;10;9" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="35" cy="35" r="6" fill="#fbbf24">
        <animate attributeName="r" values="6;7;6" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="35" cy="35" r="3" fill="white">
        <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default BeaconLogo;
