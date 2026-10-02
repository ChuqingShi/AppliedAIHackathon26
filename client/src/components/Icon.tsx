import type { ReactNode } from "react";

const ICONS = {
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  check: <polyline points="5 12.5 10 17.5 19 7" />,
  bang: <><line x1="12" y1="5" x2="12" y2="14" /><line x1="12" y1="19" x2="12" y2="19.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
  doc: <><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v5h5" /></>,
  msg: <path d="M4 4h16v12H9l-5 4z" />,
  dollar: <><line x1="12" y1="2" x2="12" y2="22" /><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.6 3-6 7-6s7 2.4 7 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 14.5c2.2.8 3.5 2.6 3.5 5.5" /></>,
  upload: <><line x1="12" y1="16" x2="12" y2="4" /><polyline points="7 9 12 4 17 9" /><line x1="4" y1="20" x2="20" y2="20" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  shield: <path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></>,
  send: <path d="M21 3 3 10.5l7 2.5 2.5 7z" />,
  flag: <path d="M5 21V4h13l-3 5 3 5H5" />,
  task: <><rect x="4" y="4" width="16" height="16" rx="3" /><polyline points="8 12.5 11 15.5 16 9" /></>,
  folder: <path d="M3 6h7l2 3h9v10H3z" />,
  spark: <><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  pin: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  x: <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  redo: <><polyline points="15 4 20 9 15 14" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, sm }: { name: IconName; sm?: boolean }) {
  return (
    <svg className={sm ? "ic sm" : "ic"} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
