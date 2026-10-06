import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, getErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { ConfirmDialog } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDeleteImage } from '@/hooks/useDeleteImage'
import { useImage } from '@/hooks/useImages'
import { formatBytes, formatDateTime } from '@/utils/format'
import { describeTransformations } from '@/utils/transformations'

export default function ImageDetails() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const image = useImage(id)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const remove = useDeleteImage(() => navigate('/images', { replace: true }))

  if (image.isPending) return <PageLoader />
  if (image.isError) {
    const notFound = image.error instanceof ApiError && [400, 404].includes(image.error.status)
    return notFound ? (
      <EmptyState
        icon="image"
        title="Image not found"
        description="It may have been deleted."
        action={
          <Link to="/images" className="text-sm font-medium text-indigo-600">
            Back to gallery
          </Link>
        }
      />
    ) : (
      <ErrorState message={getErrorMessage(image.error)} onRetry={() => image.refetch()} />
    )
  }

  const img = image.data
  const meta: [string, string][] = [
    ['Format', img.format.toUpperCase()],
    ['MIME type', img.mimeType],
    ['Dimensions', `${img.width} × ${img.height} px`],
    ['File size', formatBytes(img.size)],
    ['Uploaded', formatDateTime(img.createdAt)],
    ['Versions', String(img.variants.length)],
  ]

  return (
    <>
      <Link to="/images" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="back" className="h-4 w-4" /> Gallery
      </Link>
      <PageHeader
        title={img.originalName}
        actions={
          <>
            <a
              href={img.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              <Icon name="download" className="h-4 w-4" /> Original
            </a>
            <Link
              to={`/images/${img.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
            >
              <Icon name="edit" className="h-4 w-4" /> Edit
            </Link>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Icon name="trash" className="h-4 w-4" /> Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex min-h-64 items-center justify-center bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:20px_20px]">
            <img src={img.url} alt={img.originalName} className="max-h-[70vh] object-contain" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="divide-y divide-slate-100 text-sm">
              {meta.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">Links are private and expire after {img.urlExpiresIn / 60} minutes.</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Transformed versions" description="Cached results; identical requests reuse them." />
        <CardBody>
          {img.variants.length === 0 ? (
            <EmptyState
              icon="sparkles"
              title="No versions yet"
              action={
                <Link to={`/images/${img.id}/edit`} className="text-sm font-medium text-indigo-600">
                  Open the editor →
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {img.variants.map((v) => (
                <li key={v.id} className="overflow-hidden rounded-lg border border-slate-200">
                  <a href={v.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-slate-100">
                    <img src={v.url} alt="Transformed version" loading="lazy" className="h-full w-full object-contain" />
                  </a>
                  <div className="space-y-1 p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge tone="indigo">{v.format.toUpperCase()}</Badge>
                      <span className="text-slate-500">
                        {v.width}×{v.height} · {formatBytes(v.size)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-slate-600">{describeTransformations(v.transformations) || 'Re-encoded'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Delete image?"
        confirmLabel="Delete"
        loading={remove.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => remove.mutate(img.id)}
        message={`"${img.originalName}" and its ${img.variants.length} transformed version(s) will be permanently deleted.`}
      />
    </>
  )
}
