import { CheckIcon } from '../ui/icons.jsx'
import Logo from '../ui/Logo.jsx'

const HIGHLIGHTS = [
  'Find great deals from people near you',
  'Sell what you no longer need in minutes',
  'Every account has a verified email',
]

// Split screen on large screens: a brand panel on the left and the form card on
// the right. On small screens only the card shows, with the logo above it.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-linear-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-400/20 blur-3xl"
        />

        <div className="relative">
          <Logo light />
        </div>
        <div className="relative">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">
            Buy and sell,
            <br />
            simply and safely.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((text) => (
              <li key={text} className="flex items-center gap-3 text-indigo-100">
                <span className="flex size-6 items-center justify-center rounded-full bg-white/15">
                  <CheckIcon className="size-4 text-white" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-indigo-200">
          © {new Date().getFullYear()} Marketplace
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo />
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 shadow-slate-200/70 ring-slate-200 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
          {footer && (
            <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
          )}
        </div>
      </main>
    </div>
  )
}
