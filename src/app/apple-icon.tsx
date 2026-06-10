import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Renders the Magick Voice mark (see public/logo.svg) on a white tile.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          borderRadius: 40,
        }}
      >
        <svg width="150" height="150" viewBox="0 0 512 512" fill="none">
          <defs>
            <linearGradient id="mv" x1="40" y1="490" x2="500" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#9333ea" />
              <stop offset="48%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <circle cx="256" cy="26" r="16" fill="url(#mv)" />
          <rect x="250" y="34" width="12" height="40" rx="6" fill="url(#mv)" />
          <rect x="116" y="126" width="30" height="72" rx="15" fill="url(#mv)" />
          <rect x="366" y="126" width="30" height="72" rx="15" fill="url(#mv)" />
          <path
            d="M166 212 H346 Q364 212 364 194 V130 Q364 66 300 66 H212 Q148 66 148 130 V194 Q148 212 166 212 Z"
            fill="url(#mv)"
          />
          <rect x="178" y="106" width="156" height="82" rx="26" fill="#ffffff" />
          <circle cx="223" cy="147" r="14" fill="url(#mv)" />
          <circle cx="289" cy="147" r="14" fill="url(#mv)" />
          <path
            d="M70 446 L154 275 L256 450 L358 275 L442 446"
            stroke="url(#mv)"
            strokeWidth="46"
            strokeMiterlimit="8"
          />
          <path d="M428 238 a17 17 0 0 1 0 28" stroke="url(#mv)" strokeWidth="15" strokeLinecap="round" />
          <path d="M450 218 a40 40 0 0 1 0 68" stroke="url(#mv)" strokeWidth="15" strokeLinecap="round" />
          <path d="M472 198 a66 66 0 0 1 0 108" stroke="url(#mv)" strokeWidth="15" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
