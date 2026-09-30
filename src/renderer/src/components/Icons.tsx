import type { ReactElement, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = ({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }): ReactElement => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
)

const icon = (children: React.ReactNode) => (props: IconProps) => base({ ...props, children })

export const PlusIcon = icon(<path d="M8 3v10M3 8h10" />)
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3 3" />
  </>
)
export const LockIcon = icon(
  <>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.6" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </>
)
export const GearIcon = icon(
  <>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
  </>
)
export const PeopleIcon = icon(
  <>
    <circle cx="6" cy="5.5" r="2.2" />
    <path d="M1.8 13c.3-2.4 2-3.8 4.2-3.8s3.9 1.4 4.2 3.8" />
    <path d="M10.6 3.5a2.1 2.1 0 0 1 0 4.1M12 9.6c1.3.5 2.1 1.7 2.3 3.4" />
  </>
)
export const PlayIcon = icon(<path d="M5 3.4v9.2a.5.5 0 0 0 .77.42l7.1-4.6a.5.5 0 0 0 0-.84l-7.1-4.6A.5.5 0 0 0 5 3.4Z" />)
export const PinIcon = icon(
  <>
    <path d="M9.6 2.2 13.8 6.4l-1.5.4-2 2 .2 3-1 1L3.2 6.5l1-1 3 .2 2-2 .4-1.5Z" />
    <path d="m5.8 10.2-3.4 3.4" />
  </>
)
export const TagIcon = icon(
  <>
    <path d="M2.5 7.6V3.5a1 1 0 0 1 1-1h4.1a1 1 0 0 1 .7.3l5 5a1 1 0 0 1 0 1.4l-4.1 4.1a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1-.3-.7Z" />
    <circle cx="5.4" cy="5.4" r=".6" fill="currentColor" />
  </>
)
export const ChevronIcon = icon(<path d="m6 3.5 4.5 4.5L6 12.5" />)
export const BackIcon = icon(<path d="M10 3.5 5.5 8l4.5 4.5" />)
export const CloseIcon = icon(<path d="m4 4 8 8M12 4l-8 8" />)
export const PhoneIcon = icon(
  <>
    <rect x="4.5" y="1.8" width="7" height="12.4" rx="1.6" />
    <path d="M7.2 12h1.6" />
  </>
)
export const QrIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="4" height="4" rx=".6" />
    <rect x="9.5" y="2.5" width="4" height="4" rx=".6" />
    <rect x="2.5" y="9.5" width="4" height="4" rx=".6" />
    <path d="M9.5 9.5h1.5v1.5M13.5 9.5v1M9.5 13.5h1M12.5 12.5h1v1" />
  </>
)
export const WindowIcon = icon(
  <>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8" />
    <path d="M1.8 6h12.4" />
  </>
)
export const FolderIcon = icon(
  <path d="M1.8 4.5a1 1 0 0 1 1-1h3.1l1.4 1.5h5.9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.800a1 1 0 0 1-1-1v-7.500Z" />
)
export const KeyIcon = icon(
  <>
    <circle cx="5.2" cy="10.8" r="2.7" />
    <path d="m7.2 8.8 6-6M11 5l1.8 1.800M9.300 6.700l1.300 1.300" />
  </>
)
export const DownloadIcon = icon(<path d="M8 2.500v7.500M4.800 7 8 10.200 11.200 7M3 13.200h10" />)
export const FingerprintIcon = icon(
  <>
    <path d="M3.200 5.600A5.600 5.600 0 0 1 8 2.800c3 0 5.200 2.300 5.200 5.200 0 1.100-.1 2.300-.4 3.300" />
    <path d="M2.800 8.300c0 1.200-.1 2-.4 2.900M5.300 13.400c.5-1.500.7-3.200.7-5.300a2 2 0 0 1 4 0c0 2.300-.3 4.100-.9 5.700M8 8.100c0 2.200-.2 3.800-.7 5.300M10.700 5.900" />
  </>
)
export const ShieldIcon = icon(
  <>
    <path d="M8 1.800 13 3.600v4c0 3.200-2 5.400-5 6.600-3-1.200-5-3.400-5-6.600v-4l5-1.800Z" />
    <path d="m5.800 8 1.600 1.600 2.900-3.100" />
  </>
)
