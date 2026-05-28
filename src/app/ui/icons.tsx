import type { CSSProperties } from "react";

type IconName =
  | "audio"
  | "chevronRight"
  | "clock"
  | "download"
  | "file"
  | "folder"
  | "list"
  | "mic"
  | "monitor"
  | "pause"
  | "pin"
  | "play"
  | "plus"
  | "record"
  | "search"
  | "settings"
  | "spark"
  | "stop"
  | "users";

export function Icon({
  name,
  size = 16,
  className = "",
  style
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `ic ${className}`.trim(),
    style
  };

  switch (name) {
    case "audio":
      return (
        <svg {...common}>
          <path d="M4 9v6" />
          <path d="M8 6v12" />
          <path d="M12 3v18" />
          <path d="M16 7v10" />
          <path d="M20 10v4" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v11" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 20h14" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      );
    case "mic":
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      );
    case "monitor":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8" />
          <path d="M12 16v4" />
        </svg>
      );
    case "pause":
      return (
        <svg {...common}>
          <path d="M9 5v14" />
          <path d="M15 5v14" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="m15 4 5 5-4 1-4 7-2-2 7-4z" />
          <path d="m9 15-5 5" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="m8 5 12 7-12 7z" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "record":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          <path d="M4 12h2" />
          <path d="M18 12h2" />
          <path d="m6.3 6.3 1.4 1.4" />
          <path d="m16.3 16.3 1.4 1.4" />
          <path d="m17.7 6.3-1.4 1.4" />
          <path d="m7.7 16.3-1.4 1.4" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5z" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 20a4 4 0 0 0-8 0" />
          <circle cx="12" cy="9" r="4" />
          <path d="M22 20a3 3 0 0 0-4-2.8" />
          <path d="M17 6.2a3 3 0 0 1 0 5.6" />
        </svg>
      );
  }
}
