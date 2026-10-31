import type { SVGProps } from 'react';

export type IconName =
  | 'upload'
  | 'file'
  | 'table'
  | 'tree'
  | 'text'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronLeft'
  | 'sun'
  | 'moon'
  | 'globe'
  | 'x'
  | 'github'
  | 'close'
  | 'trash'
  | 'download'
  | 'copy'
  | 'check'
  | 'alert'
  | 'arrowUp'
  | 'arrowDown'
  | 'search'
  | 'undo'
  | 'plus'
  | 'sliders'
  | 'chart'
  | 'refresh'
  | 'lock'
  | 'wand'
  | 'swap'
  | 'folder'
  | 'archive'
  | 'info'
  | 'eye'
  | 'eyeOff'
  | 'drag'
  | 'menu';

const PATHS: Record<IconName, string> = {
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  table: 'M4 5h16v14H4zM4 10h16M10 10v9M4 15h16',
  tree: 'M5 4h5v4H5zM14 10h5v4h-5zM14 17h5v3h-5zM8 8v10h6M14 12H9',
  text: 'M5 6h14M5 11h10M5 16h14',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 6l-6 6 6 6',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z',
  x: 'M4 4l7.6 9.8L4.5 20h2.2l6-7 4.3 5.6H21l-7.9-10.2L20.2 4h-2.2l-5.6 6.5L8.2 4H4z',
  github:
    'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
  download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  copy: 'M9 9V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-4M4 10a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
  check: 'M4 12.5 9 18 20 6',
  alert: 'M12 3 2.5 20h19zM12 9v5m0 3h.01',
  arrowUp: 'M12 20V5m0 0-6 6m6-6 6 6',
  arrowDown: 'M12 4v15m0 0 6-6m-6 6-6-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2',
  undo: 'M4 9h9a5 5 0 0 1 0 10h-3M4 9l4-4M4 9l4 4',
  plus: 'M12 5v14M5 12h14',
  sliders: 'M4 7h9m4 0h3M4 12h3m4 0h9M4 17h11m4 0h1M13 4v6M9 9v6M15 14v6',
  chart: 'M5 20V9m5 11V4m5 16v-7m5 7V12',
  refresh: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  lock: 'M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3',
  wand: 'M15 4l1.5 3L20 8.5 16.5 10 15 13l-1.5-3L10 8.5 13.5 7zM4 20l7-7',
  swap: 'M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  archive: 'M3 5h18v4H3zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5m0-8h.01',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M4 4l16 16M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.2 7.9C3.7 9.6 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.3 4-.9M9.9 10a3 3 0 0 0 4.2 4.2',
  drag: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'x' || name === 'github' ? 1.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {name === 'x' || name === 'github' ? (
        <path d={PATHS[name]} fill="currentColor" stroke="none" />
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}
