export function Skyline({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 320" aria-hidden="true">
      <defs>
        <linearGradient id="skylineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A3018" />
          <stop offset="35%" stopColor="#2E1E10" />
          <stop offset="100%" stopColor="#15100B" />
        </linearGradient>
        <filter id="distantBlur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <mask id="waveMask" maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="320">
          <path
            fill="#fff"
            d="M0,0 H600 V312 C570,312 570,320 540,320 C510,320 510,312 480,312 C450,312 450,320 420,320 C390,320 390,312 360,312 C330,312 330,320 300,320 C270,320 270,312 240,312 C210,312 210,320 180,320 C150,320 150,312 120,312 C90,312 90,320 60,320 C30,320 30,312 0,312 Z"
          />
        </mask>
      </defs>
      <g
        fill="url(#skylineGrad)"
        stroke="#8a6b3f"
        strokeWidth="0.9"
        strokeOpacity="0.5"
        mask="url(#waveMask)"
      >
        <g filter="url(#distantBlur)" opacity="0.9">
          <rect x="440" y="178" width="20" height="52" />
          <rect x="437" y="171" width="26" height="6" />
          <polygon points="440,171 450,153 460,171" />
          <circle cx="450" cy="149" r="2.6" />
        </g>
        <g filter="url(#distantBlur)" opacity="0.9">
          <rect x="90" y="188" width="16" height="42" />
          <polygon points="90,188 98,172 106,188" />
          <circle cx="98" cy="169" r="2" />
        </g>
        <path
          fillRule="evenodd"
          d="M0,255 H600 V320 H0 Z M4,320 A26,26 0 0 1 56,320 Z M64,320 A26,26 0 0 1 116,320 Z M124,320 A26,26 0 0 1 176,320 Z M184,320 A26,26 0 0 1 236,320 Z M244,320 A26,26 0 0 1 296,320 Z M304,320 A26,26 0 0 1 356,320 Z M364,320 A26,26 0 0 1 416,320 Z M424,320 A26,26 0 0 1 476,320 Z M484,320 A26,26 0 0 1 536,320 Z M544,320 A26,26 0 0 1 596,320 Z"
        />
        <path d="M0,255 L0,232 L18,232 L18,220 L38,220 L38,236 L60,236 L60,214 L82,214 L82,228 L100,228 L100,210 L118,210 L118,225 L600,225 L600,255 Z" />
        <rect x="24" y="205" width="6" height="16" />
        <rect x="70" y="198" width="6" height="17" />
        <polygon points="106,210 110,196 114,210" />
        <g strokeWidth="1.1">
          <rect x="330" y="158" width="24" height="72" />
          <rect x="326" y="150" width="32" height="6" />
          <path d="M330,150 C330,128 354,128 354,150 C354,134 344,124 342,113 C340,124 330,134 330,150 Z" />
          <rect x="339" y="106" width="6" height="10" />
          <circle cx="342" cy="102" r="2.6" />
          <polygon points="326,150 330,142 334,150" />
          <polygon points="350,150 354,142 358,150" />
          <rect x="360" y="166" width="22" height="64" />
          <rect x="356" y="158" width="30" height="6" />
          <path d="M360,158 C360,138 382,138 382,158 C382,144 373,135 371,125 C369,135 360,144 360,158 Z" />
          <rect x="368" y="118" width="6" height="9" />
          <circle cx="371" cy="114" r="2.4" />
          <polygon points="356,158 360,151 364,158" />
          <polygon points="378,158 382,151 386,158" />
        </g>
        <path d="M230,230 L230,196 L420,196 L420,230 Z" />
        <path d="M240,205 Q250,196 260,205 L260,225 L240,225 Z" />
        <path d="M264,205 Q274,196 284,205 L284,225 L264,225 Z" />
        <path d="M388,205 Q398,196 408,205 L408,225 L388,225 Z" />
        <polygon points="230,196 236,188 242,196" />
        <polygon points="408,196 414,188 420,196" />
        <g strokeWidth="1.1">
          <path d="M172,230 L172,140 L184,140 L184,116 L189,116 L196,60 L192,58 L199,26 L201,26 L208,58 L204,60 L211,116 L216,116 L216,140 L228,140 L228,230 Z" />
          <circle cx="200" cy="19" r="4" />
          <rect x="196" y="23" width="8" height="6" />
          <rect x="186" y="150" width="9" height="20" />
          <rect x="205" y="150" width="9" height="20" />
          <rect x="180" y="178" width="40" height="9" />
          <polygon points="180,178 186,169 192,178" />
          <polygon points="208,178 214,169 220,178" />
          <path d="M172,205 L160,222 L172,222 Z" />
          <path d="M228,205 L240,222 L228,222 Z" />
        </g>
        <g>
          <path d="M231,230 L231,198 C231,170 238,155 250,148 C262,155 269,170 269,198 L269,230 Z" />
          <rect x="244" y="138" width="12" height="12" />
          <rect x="240" y="130" width="20" height="6" />
          <path d="M244,130 C244,118 256,118 256,130 C256,122 251,116 250,109 C249,116 244,122 244,130 Z" />
          <rect x="248" y="103" width="4" height="8" />
          <circle cx="250" cy="100" r="2.4" />
          <polygon points="240,130 244,123 248,130" />
          <polygon points="252,130 256,123 260,130" />
          <path d="M272,230 L272,208 C272,190 278,178 286,172 C294,178 300,190 300,208 L300,230 Z" />
          <rect x="282" y="164" width="8" height="10" />
          <circle cx="286" cy="160" r="2.2" />
        </g>
      </g>
    </svg>
  );
}
