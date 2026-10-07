import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon } from './icons.jsx'

// role="alert" makes screen readers announce problems right away;
// role="status" announces good news without interrupting
const TYPES = {
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Icon: CheckCircleIcon,
    role: 'status',
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-800',
    Icon: XCircleIcon,
    role: 'alert',
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    Icon: WarningIcon,
    role: 'alert',
  },
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-800',
    Icon: InfoIcon,
    role: 'status',
  },
}

export default function Alert({ type = 'info', title, children }) {
  const { box, Icon, role } = TYPES[type]

  return (
    <div role={role} className={`flex gap-3 rounded-xl border p-4 text-sm ${box}`}>
      <Icon className="mt-px size-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}
