import { Link } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { Wallet } from '@/types/wallet'
import { formatMoney } from '@/utils/format'

export function WalletCard({ wallet, isLoading }: { wallet?: Wallet; isLoading?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-white shadow-sm">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
      <p className="text-sm font-medium text-white/80">Available balance</p>
      <div className="mt-2 min-h-10">
        {isLoading || !wallet ? (
          <LoadingSpinner className="text-white" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{formatMoney(wallet.balance, wallet.currency)}</p>
        )}
      </div>
      <p className="mt-1 text-xs text-white/70">{wallet?.currency ?? 'USD'} wallet</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/wallet/top-up"
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-indigo-800 shadow-sm hover:bg-white/90"
        >
          <Icon name="plus" className="h-4 w-4" /> Top up
        </Link>
        <Link
          to="/wallet/transfer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/40 px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/30 hover:bg-indigo-500/60"
        >
          <Icon name="send" className="h-4 w-4" /> Transfer
        </Link>
      </div>
    </div>
  )
}
