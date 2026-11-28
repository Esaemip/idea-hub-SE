import type { ReactNode } from 'react'

const Svg = ({ size = 16, width = 2, children }: { size?: number; width?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const PanelIcon = () => <Svg size={18}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></Svg>
export const PlusIcon = () => <Svg width={2.2}><path d="M12 5v14M5 12h14" /></Svg>
export const SearchIcon = ({ size = 16 }: { size?: number }) => <Svg size={size} width={2.2}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
export const FolderIcon = () => <Svg><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></Svg>
export const StackIcon = () => <Svg><path d="M5 4h14v11l-5 5H5z" /><path d="M8 9h8M8 13h5" /></Svg>
export const SparkIcon = () => <Svg size={15}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>
export const CursorIcon = () => <Svg size={18}><path d="M5 3l6 17 2.5-7 7-2.5z" /></Svg>
export const HandIcon = () => <Svg size={18}><path d="M7 11V6a1.5 1.5 0 013 0v5" /><path d="M10 10V4.5a1.5 1.5 0 013 0V10" /><path d="M13 10V6a1.5 1.5 0 013 0v6" /><path d="M16 9.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a6 6 0 01-4.6-2.2L4 15.5a1.5 1.5 0 012.3-1.9L7 14.5V11" /></Svg>
export const NoteIcon = () => <Svg size={18}><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" /></Svg>
export const StarIcon = ({ size = 18, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#E5484D' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" /></svg>
)
export const ChevronIcon = ({ size = 16, rotate = 0 }: { size?: number; rotate?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 0.25s' }}><path d="M9 6l6 6-6 6" /></svg>
)
export const CloseIcon = () => <Svg width={2.2}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const PencilIcon = () => <Svg size={14}><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Svg>
export const AlertIcon = () => <Svg size={18} width={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5v0.5" /></Svg>
export const OfflineIcon = () => <Svg size={26}><path d="M3 3l18 18" /><path d="M8.5 8.5A5.5 5.5 0 006 13H5.5a3.5 3.5 0 000 7H17" /><path d="M11 6.2A6 6 0 0117.8 11 3.5 3.5 0 0120.6 17" /></Svg>
export const MissingIcon = () => <Svg size={26}><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></Svg>
export const SproutIcon = () => (
  <svg width="92" height="92" viewBox="0 0 64 64" fill="none" stroke="#B8B9C2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M32 58V30" /><path d="M32 34c-2-10-10-14-18-12 1 9 8 14 18 12z" /><path d="M32 30c2-10 10-14 18-12-1 9-8 14-18 12z" /><path d="M14 58c6-5 30-5 36 0" /></svg>
)

export const LogoMark = () => (
  <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="8" fill="#111118" />
    <g stroke="#55586A" strokeWidth="1.3" strokeLinecap="round"><line x1="14" y1="14" x2="14" y2="5.5" /><line x1="14" y1="14" x2="22.1" y2="11.4" /><line x1="14" y1="14" x2="19" y2="20.9" /><line x1="14" y1="14" x2="9" y2="20.9" /><line x1="14" y1="14" x2="5.9" y2="11.4" /></g>
    <circle cx="14" cy="5.5" r="2.3" fill="#5B8DF5" /><circle cx="22.1" cy="11.4" r="2.3" fill="#F28A45" /><circle cx="19" cy="20.9" r="2.3" fill="#A974E8" /><circle cx="9" cy="20.9" r="2.3" fill="#3FBF8A" /><circle cx="5.9" cy="11.4" r="2.3" fill="#E35D8C" /><circle cx="14" cy="14" r="2.6" fill="#FFFFFF" />
  </svg>
)
