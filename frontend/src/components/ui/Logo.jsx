import { ShoppingBagIcon } from './icons.jsx'

// The app name with its icon; `light` is for dark backgrounds
export default function Logo({ light = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`flex size-9 items-center justify-center rounded-xl ${
          light
            ? 'bg-white/15 text-white ring-1 ring-white/25'
            : 'bg-indigo-600 text-white shadow-sm'
        }`}
      >
        <ShoppingBagIcon className="size-5" />
      </span>
      <span
        className={`text-lg font-semibold tracking-tight ${
          light ? 'text-white' : 'text-slate-900'
        }`}
      >
        Marketplace
      </span>
    </span>
  )
}
