import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '@/api/client'
import { imagesApi } from '@/api/images.api'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { imageKeys } from '@/hooks/useImages'
import { useToast } from '@/hooks/useToast'
import type { Image } from '@/types/image'
import { formatBytes } from '@/utils/format'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

interface Selected {
  file: File
  previewUrl: string
  width?: number
  height?: number
}

/** Client-side checks for fast feedback; the server re-validates the real file content. */
function validate(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return 'Only JPEG, PNG and WebP images are allowed.'
  if (file.size > MAX_BYTES) return `File is too large (${formatBytes(file.size)}). Maximum is 10 MB.`
  return null
}

export function ImageUploader() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [dragging, setDragging] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploaded, setUploaded] = useState<Image | null>(null)

  // Free the object URL when the preview changes or the component unmounts.
  useEffect(() => () => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
  }, [selected])

  const upload = useMutation({
    mutationFn: (file: File) => imagesApi.upload(file, setProgress),
    onSuccess: (image) => {
      setUploaded(image)
      queryClient.invalidateQueries({ queryKey: imageKeys.all })
      toast.success('Image uploaded.')
    },
  })

  const choose = (file: File | undefined) => {
    if (!file) return
    upload.reset()
    setUploaded(null)
    setProgress(0)
    const error = validate(file)
    setClientError(error)
    if (error) {
      setSelected(null)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setSelected({ file, previewUrl })
    const img = new window.Image()
    img.onload = () =>
      setSelected((s) => (s?.previewUrl === previewUrl ? { ...s, width: img.naturalWidth, height: img.naturalHeight } : s))
    img.src = previewUrl
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    choose(e.dataTransfer.files[0])
  }

  const resetAll = () => {
    setSelected(null)
    setUploaded(null)
    setClientError(null)
    setProgress(0)
    upload.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  const error = clientError ?? (upload.isError ? getErrorMessage(upload.error) : null)

  return (
    <div className="space-y-4">
      {!selected && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-surface hover:border-indigo-400 hover:bg-slate-50'
          }`}
        >
          <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
            <Icon name="upload" className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900">
            Drag &amp; drop an image here, or <span className="text-indigo-600">browse</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">JPEG, PNG or WebP · up to 10 MB</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(e) => choose(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {selected && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface">
          <div className="flex max-h-96 items-center justify-center bg-slate-100">
            <img src={selected.previewUrl} alt="Selected file preview" className="max-h-96 object-contain" />
          </div>
          <div className="space-y-3 p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="col-span-2">
                <dt className="text-slate-500">File name</dt>
                <dd className="truncate font-medium text-slate-900" title={selected.file.name}>
                  {selected.file.name}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Size</dt>
                <dd className="font-medium text-slate-900">{formatBytes(selected.file.size)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Dimensions</dt>
                <dd className="font-medium text-slate-900">
                  {selected.width ? `${selected.width}×${selected.height}` : '…'}
                </dd>
              </div>
            </dl>

            {(upload.isPending || uploaded) && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{uploaded ? 'Uploaded' : progress < 100 ? 'Uploading…' : 'Processing…'}</span>
                  <span>{progress}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full transition-all ${uploaded ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {uploaded ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm font-medium text-emerald-700">✓ Upload complete</span>
                <Link
                  to={`/images/${uploaded.id}`}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  View
                </Link>
                <Link
                  to={`/images/${uploaded.id}/edit`}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Edit image
                </Link>
                <Button variant="secondary" onClick={resetAll}>
                  Upload another
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => upload.mutate(selected.file)} loading={upload.isPending}>
                  <Icon name="upload" className="h-4 w-4" /> Upload
                </Button>
                <Button variant="secondary" onClick={resetAll} disabled={upload.isPending}>
                  Choose another file
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
