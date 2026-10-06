import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError, getErrorMessage } from '@/api/client'
import { imagesApi } from '@/api/images.api'
import { ImageTransformForm } from '@/components/images/ImageTransformForm'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { LoadingSpinner, PageLoader } from '@/components/ui/LoadingSpinner'
import { PageHeader } from '@/components/ui/PageHeader'
import { imageKeys, useImage } from '@/hooks/useImages'
import { useToast } from '@/hooks/useToast'
import type { ImageVariant, TransformResult } from '@/types/image'
import { formatBytes } from '@/utils/format'
import { describeTransformations } from '@/utils/transformations'

const CHECKERBOARD = 'bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:20px_20px]'

function Preview({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={title} />
      <div className={`flex min-h-64 flex-1 items-center justify-center p-2 ${CHECKERBOARD}`}>{children}</div>
      {footer && <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-600">{footer}</div>}
    </Card>
  )
}

export default function ImageEditor() {
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const image = useImage(id)
  const [result, setResult] = useState<(ImageVariant & { cached?: boolean }) | null>(null)

  const transform = useMutation({
    mutationFn: (t: Parameters<typeof imagesApi.transform>[1]) => imagesApi.transform(id, t),
    onSuccess: (res: TransformResult) => {
      setResult(res)
      queryClient.invalidateQueries({ queryKey: imageKeys.detail(id) })
      toast.success(res.cached ? 'Loaded from cache — this version already existed.' : 'Transformation applied.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (image.isPending) return <PageLoader />
  if (image.isError) {
    const notFound = image.error instanceof ApiError && [400, 404].includes(image.error.status)
    return notFound ? (
      <EmptyState icon="image" title="Image not found" />
    ) : (
      <ErrorState message={getErrorMessage(image.error)} onRetry={() => image.refetch()} />
    )
  }

  const img = image.data

  return (
    <>
      <Link to={`/images/${img.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <Icon name="back" className="h-4 w-4" /> Image details
      </Link>
      <PageHeader title="Image editor" description={img.originalName} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title="Transformations" description="Combine as many as you like." />
          <CardBody>
            <ImageTransformForm image={img} loading={transform.isPending} onSubmit={(t) => transform.mutate(t)} />
          </CardBody>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <Preview
              title="Original preview"
              footer={`${img.format.toUpperCase()} · ${img.width}×${img.height} · ${formatBytes(img.size)}`}
            >
              <img src={img.url} alt="Original" className="max-h-96 object-contain" />
            </Preview>

            <Preview
              title="Transformed preview"
              footer={
                result && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {result.format.toUpperCase()} · {result.width}×{result.height} · {formatBytes(result.size)}
                    </span>
                    {result.cached && <Badge tone="yellow">cached</Badge>}
                    <a href={result.url} target="_blank" rel="noreferrer" className="ml-auto font-medium text-indigo-600 hover:text-indigo-500">
                      Open ↗
                    </a>
                  </div>
                )
              }
            >
              {transform.isPending ? (
                <LoadingSpinner size="lg" label="Processing…" />
              ) : result ? (
                <img src={result.url} alt="Transformed" className="max-h-96 object-contain" />
              ) : (
                <p className="px-6 text-center text-sm text-slate-500">Choose transformations and click “Apply”.</p>
              )}
            </Preview>
          </div>

          {img.variants.length > 0 && (
            <Card>
              <CardHeader title="Previous versions" description="Click one to preview it." />
              <CardBody>
                <ul className="flex gap-3 overflow-x-auto pb-1">
                  {img.variants.map((v) => (
                    <li key={v.id} className="w-36 shrink-0">
                      <button
                        type="button"
                        onClick={() => setResult({ ...v, cached: true })}
                        className={`block w-full overflow-hidden rounded-lg border text-left ${
                          result?.id === v.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={`block aspect-square ${CHECKERBOARD}`}>
                          <img src={v.url} alt="" loading="lazy" className="h-full w-full object-contain" />
                        </span>
                        <span className="block truncate px-2 py-1.5 text-xs text-slate-600" title={describeTransformations(v.transformations)}>
                          {describeTransformations(v.transformations) || v.format.toUpperCase()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
