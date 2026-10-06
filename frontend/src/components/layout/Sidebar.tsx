import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from '@/components/ui/Icon'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

export const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  {
    title: 'Images',
    items: [
      { to: '/images', label: 'Gallery', icon: 'image', end: true },
      { to: '/images/upload', label: 'Upload', icon: 'upload' },
    ],
  },
  {
    title: 'Wallet',
    items: [
      { to: '/wallet', label: 'Wallet', icon: 'wallet', end: true },
      { to: '/wallet/top-up', label: 'Top up', icon: 'plus' },
      { to: '/wallet/transfer', label: 'Transfer', icon: 'send' },
      { to: '/wallet/transactions', label: 'Transactions', icon: 'list' },
      { to: '/wallet/analytics', label: 'Analytics', icon: 'chart' },
    ],
  },
]

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6" aria-label="Main">
      {NAV_SECTIONS.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{section.title}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Brand() {
  return (
    <div className="flex items-center gap-2 px-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">IW</div>
      <span className="text-base font-semibold text-slate-900">ImageWallet</span>
    </div>
  )
}

/** Fixed sidebar, visible on large screens only (mobile uses the drawer in Navbar). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 border-r border-slate-200 bg-surface px-3 py-5 lg:flex">
      <Brand />
      <SidebarNav />
      <p className="px-3 text-xs text-slate-400">© {new Date().getFullYear()} Vazha Lomidze</p>
    </aside>
  )
}
