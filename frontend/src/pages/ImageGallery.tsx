import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '@/api/client'
import { ImageCard } from '@/components/images/ImageCard'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { ConfirmDialog } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { useDeleteImage } from '@/hooks/useDeleteImage'
import { useImages } from '@/hooks/useImages'
import type { Image } from '@/types/image'

const PAGE_SIZE = 12

export default function ImageGallery() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [toDelete, setToDelete] = useState<Image | null>(null)

  const images = useImages(page, PAGE_SIZE)
  const remove = useDeleteImage(() => setToDelete(null))

  const setPage = (p: number) => setParams(p > 1 ? { page: String(p) } : {}, { replace: true })

  // If the last image of a page was deleted, step back to a page that exists.
  const totalPages = images.data?.pagination.totalPages
  useEffect(() => {
    if (totalPages !== undefined && totalPages > 0 && page > totalPages) setPage(totalPages)
  })

  const uploadLink = (
    <Link
      to="/images/upload"
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
    >
      <Icon name="upload" className="h-4 w-4" /> Upload
    </Link>
  )

  return (
    <>
      <PageHeader title="Image gallery" description="Your uploaded images." actions={uploadLink} />

      {images.isPending ? (
        <PageLoader />
      ) : images.isError ? (
        <ErrorState message={getErrorMessage(images.error)} onRetry={() => images.refetch()} />
      ) : images.data.data.length === 0 ? (
        <EmptyState
          icon="image"
          title="No images yet"
          description="Upload your first image to resize, rotate, watermark and convert it."
          action={uploadLink}
        />
      ) : (
        <>
          <div
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${images.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {images.data.data.map((image) => (
              <ImageCard key={image.id} image={image} onDelete={setToDelete} />
            ))}
          </div>
          <Pagination pagination={images.data.pagination} onPageChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Delete image?"
        confirmLabel="Delete"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        message={
          <>
            <span className="font-medium text-slate-900">{toDelete?.originalName}</span> and all its transformed versions
            will be permanently deleted.
          </>
        }
      />
    </>
  )
}
