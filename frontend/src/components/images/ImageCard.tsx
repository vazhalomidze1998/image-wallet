import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import type { Image } from '@/types/image'
import { formatBytes, formatDate } from '@/utils/format'

export function ImageCard({ image, onDelete }: { image: Image; onDelete: (image: Image) => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      <Link to={`/images/${image.id}`} className="relative block aspect-[4/3] bg-slate-100">
        <img
          src={image.url}
          alt={image.originalName}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-slate-900" title={image.originalName}>
            {image.originalName}
          </h3>
          <Badge tone="indigo">{image.format.toUpperCase()}</Badge>
        </div>
        <p className="text-xs text-slate-500">
          {image.width}×{image.height} · {formatBytes(image.size)} · {formatDate(image.createdAt)}
        </p>
        <div className="mt-auto flex items-center gap-1 border-t border-slate-100 pt-2">
          <Link
            to={`/images/${image.id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <Icon name="eye" className="h-4 w-4" /> View
          </Link>
          <Link
            to={`/images/${image.id}/edit`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <Icon name="edit" className="h-4 w-4" /> Edit
          </Link>
          <button
            type="button"
            onClick={() => onDelete(image)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
          >
            <Icon name="trash" className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>
    </article>
  )
}
