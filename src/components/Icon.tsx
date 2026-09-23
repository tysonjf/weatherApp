import type { SVGProps } from 'react'

/** Stroke icons drawn on a 24×24 grid. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronUp: 'M5 15l7-7 7 7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  share: 'M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M12 3v12M7.5 7.5L12 3l4.5 4.5',
  download: 'M12 3v12M7 10.5l5 5 5-5M4 20h16',
  upload: 'M12 16V4M7 8.5l5-5 5 5M4 20h16',
  calendar: 'M4 6h16v15H4zM4 10.5h16M8.5 3v5M15.5 3v5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.2 2',
  snow:
    'M12 2.5v19M3.8 7.25l16.4 9.5M20.2 7.25l-16.4 9.5M9.2 3.8L12 6.3l2.8-2.5M9.2 20.2l2.8-2.5 2.8 2.5M4.1 11l2.5 1-.5 2.7M19.9 13l-2.5-1 .5-2.7M4.6 16.5l2.4-.9.6-2.6M19.4 7.5l-2.4.9-.6 2.6',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6',
  cloud: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 9.2 5 5 0 0 0 7 19z',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  thermo: 'M14 14.76V4.5a2 2 0 0 0-4 0v10.26a4 4 0 1 0 4 0zM12 9v8',
  flame:
    'M12 22c4 0 7-2.8 7-7 0-4.5-3.5-7-4.5-11-2 1.5-3.5 4-3.5 6.5C9.5 9 9 7.5 9 6.5 6.5 8.5 5 11.5 5 15c0 4.2 3 7 7 7z',
  drop: 'M12 3s6.5 7.2 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.2 12 3 12 3z',
  home: 'M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8v3H8zM8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.2',
  alert: 'M12 3.5L22 20.5H2zM12 10v4.5M12 17.4v.2',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z',
  play: 'M8 5l11 7-11 7z',
  bowl: 'M3 11h18a9 9 0 0 1-18 0zM7.5 8c.5-1 1.5-1.5 2.5-1.5M12 7c.3-1.6 1.5-2.6 3-3',
  pizza: 'M12 21.5L2.8 6.2a17 17 0 0 1 18.4 0zM4.5 9a14 14 0 0 1 15 0M10 12.2h.01M13.5 15h.01M13 10.5h.01',
  wheat:
    'M12 21V9M12 13c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zm0-4c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zm0 8.5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L4 14.5a1.5 1.5 0 0 1 2.5-1.6L8 15',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M9.5 2.5h5',
  scale: 'M5 8h14l1.5 12h-17zM9 8V6.5a3 3 0 0 1 6 0V8M12 12v3',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1-4.5-4.3 6.1-.8z',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v3.5h3.5M4 13a8 8 0 0 0 14.6 4.5M20 20v-3.5h-3.5',
  location: 'M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
} as const

export type IconName = keyof typeof PATHS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  strokeWidth?: number
}

export function Icon({ name, size = 20, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
