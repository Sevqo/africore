import type { SVGProps } from 'react';
export type IconName =
  | 'home'
  | 'users'
  | 'box'
  | 'bag'
  | 'bolt'
  | 'bell'
  | 'right'
  | 'left'
  | 'down'
  | 'menu'
  | 'close'
  | 'search'
  | 'user'
  | 'grid'
  | 'chart'
  | 'document'
  | 'payment'
  | 'shield'
  | 'calculator'
  | 'tag'
  | 'code'
  | 'settings'
  | 'network'
  | 'check'
  | 'external'
  | 'calendar'
  | 'globe'
  | 'eye'
  | 'eye-off'
  | 'megaphone'
  | 'lifebuoy'
  | 'repeat'
  | 'factory'
  | 'wrench'
  | 'truck'
  | 'building'
  | 'book'
  | 'layers'
  | 'plug';
const paths: Record<IconName, string> = {
  home: 'm3 10 9-8 9 8v11h-6v-7H9v7H3z',
  users:
    'M16 21v-2a5 5 0 0 0-10 0v2M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M18 4a4 4 0 0 1 0 7M21 21v-3a5 5 0 0 0-3-4',
  box: 'm3 7 9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5M12 12v10M7.5 4.5l9 5',
  bag: 'M4 7h16l1 15H3zM8 8V6a4 4 0 0 1 8 0v2',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  'eye-off':
    'm3 3 18 18M9 5.5A12 12 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-3 4M6 6C3 8 2 12 2 12s3 7 10 7c2 0 4-.5 5-1.5M10 10a3 3 0 0 0 4 4',
  right: 'm9 5 7 7-7 7',
  left: 'm15 5-7 7 7 7',
  down: 'm5 9 7 7 7-7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  chart: 'M4 3v17h17M8 15l4-5 4 2 5-7',
  document: 'M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6',
  payment: 'M3 5h18v14H3zM3 10h18M7 15h3',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',
  calculator: 'M5 3h14v18H5zM8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2',
  tag: 'M20 12l-8 8-9-9V3h8zM7 7h.01',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  network: 'M12 4v6M5 18l7-8 7 8M9 2h6v5H9zM2 17h6v5H2zM16 17h6v5h-6z',
  check: 'm5 12 4 4L19 6',
  external: 'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',
  calendar: 'M4 4h16v17H4zM8 2v4M16 2v4M4 9h16M8 13h3m-3 4h3m3-4h2m-2 4h2',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  megaphone: 'M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2zM16 9a5 5 0 0 1 0 6',
  lifebuoy: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M19.1 4.9l-4.2 4.2M9.1 14.9l-4.2 4.2',
  repeat: 'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  factory: 'M2 20h20M4 20V8l6 4V8l6 4V4h4v16',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  building: 'M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5a2 2 0 0 1 2-2h14v18H6.5a2.5 2.5 0 0 1-2.5-1.5z',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  plug: 'M12 22v-5M9 8V2M15 8V2M6 8h12v4a6 6 0 0 1-12 0z',
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      className="icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
