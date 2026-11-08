import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function svg(path: ReactNode, viewBox = '0 0 24 24') {
  return function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const IconCursor = svg(
  <>
    <path d="M5 3l6.5 16 2.2-6.3L20 10.5z" />
  </>,
);

export const IconBeam = svg(
  <>
    <path d="M3 12h18" />
    <path d="M3 9.5l14 0" opacity=".45" />
    <path d="M3 14.5l14 0" opacity=".45" />
    <circle cx="19.6" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>,
);

export const IconText = svg(
  <>
    <path d="M5 6h14" />
    <path d="M12 6v13" />
  </>,
);

export const IconGrid = svg(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity=".5" />
  </>,
);

export const IconMagnet = svg(
  <>
    <path d="M6 3v8a6 6 0 0012 0V3" />
    <path d="M6 7h4M14 7h4" />
  </>,
);

export const IconUndo = svg(
  <>
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h9a6 6 0 010 12h-1" transform="translate(0,-6)" />
  </>,
);

export const IconRedo = svg(
  <>
    <path d="M15 7l5 5-5 5" />
    <path d="M20 12h-9a6 6 0 000 12h1" transform="translate(0,-6)" />
  </>,
);

export const IconPlus = svg(
  <>
    <path d="M12 5v14M5 12h14" />
  </>,
);

export const IconMinus = svg(<path d="M5 12h14" />);

export const IconFit = svg(
  <>
    <path d="M4 9V5a1 1 0 011-1h4" />
    <path d="M20 9V5a1 1 0 00-1-1h-4" />
    <path d="M4 15v4a1 1 0 001 1h4" />
    <path d="M20 15v4a1 1 0 01-1 1h-4" />
  </>,
);

export const IconFile = svg(
  <>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </>,
);

export const IconFolder = svg(
  <>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </>,
);

export const IconSave = svg(
  <>
    <path d="M12 3v11" />
    <path d="M8 10l4 4 4-4" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </>,
);

export const IconDownload = svg(
  <>
    <path d="M12 16V4" />
    <path d="M7 11l5 5 5-5" />
    <rect x="4" y="18" width="16" height="3" rx="1" />
  </>,
);

export const IconTrash = svg(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </>,
);

export const IconCopy = svg(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </>,
);

export const IconBox = svg(
  <>
    <rect x="3" y="5" width="18" height="14" rx="3" />
  </>,
);

export const IconLock = svg(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </>,
);

export const IconUnlock = svg(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 017-2.6" />
  </>,
);

export const IconAlert = svg(
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
  </>,
);

export const IconPanelLeft = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
);

export const IconPanelRight = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </>,
);

export const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </>,
);

export const IconMoon = svg(<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />);

export const IconChevronLeft = svg(<path d="M14 6l-6 6 6 6" />);
export const IconChevronRight = svg(<path d="M10 6l6 6-6 6" />);
