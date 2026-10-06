import { Outlet } from 'react-router-dom'
import { Brand } from '@/components/layout/Sidebar'
import { Icon, type IconName } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'image', title: 'Smart image processing', text: 'Resize, crop and convert in seconds.' },
  { icon: 'wallet', title: 'Built-in wallet', text: 'Top up, transfer and pay per operation.' },
  { icon: 'chart', title: 'Clear analytics', text: 'Track spending and usage at a glance.' },
]

const YEAR = new Date().getFullYear()

export function AuthLayout() {
  return (
    <div className="flex min-h-full bg-surface">
      {/* Brand panel — large screens only */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-indigo-400/30 blur-3xl" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur">
            IW
          </div>
          <span className="text-lg font-semibold text-white">ImageWallet</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Your images and your money, in one place.
          </h2>
          <p className="mt-4 text-base text-white/80">
            Process images on demand and pay only for what you use — straight from your wallet.
          </p>

          <ul className="mt-10 space-y-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex items-start gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{f.title}</span>
                  <span className="block text-sm text-white/75">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          © {YEAR} Image processing &amp; wallet platform · Vazha Lomidze
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex w-full flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:w-1/2 lg:bg-surface">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="mb-8 lg:hidden">
          <Brand />
        </div>
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 sm:p-8 lg:p-0 lg:shadow-none lg:ring-0">
          <Outlet />
        </div>
        <p className="mt-6 text-xs text-slate-400 lg:hidden">Image processing &amp; wallet platform · Vazha Lomidze</p>
      </main>
    </div>
  )
}
