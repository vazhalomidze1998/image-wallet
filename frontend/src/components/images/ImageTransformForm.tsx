import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input, Select } from '@/components/ui/Input'
import {
  DEFAULT_TRANSFORM_FORM,
  buildTransformations,
  makeTransformSchema,
  type TransformForm,
} from '@/schemas/transform.schema'
import { RESIZE_FITS, WATERMARK_POSITIONS, type Image, type Transformations } from '@/types/image'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-b border-slate-100 pb-4 last:border-b-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      {children}
    </fieldset>
  )
}

const ROTATE_PRESETS = ['0', '90', '180', '270']

export function ImageTransformForm({
  image,
  loading,
  onSubmit,
}: {
  image: Image
  loading: boolean
  onSubmit: (transformations: Transformations) => void
}) {
  const [emptyError, setEmptyError] = useState(false)
  const schema = useMemo(() => makeTransformSchema(image.width, image.height), [image.width, image.height])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TransformForm>({
    resolver: zodResolver(schema),
    defaultValues: { ...DEFAULT_TRANSFORM_FORM, cropWidth: String(image.width), cropHeight: String(image.height) },
  })

  const cropEnabled = watch('cropEnabled')
  const format = watch('format')
  const quality = watch('quality')
  const rotate = watch('rotate')
  const opacity = watch('watermarkOpacity')
  const bothDimensions = watch('width') !== '' && watch('height') !== ''
  const lossy = (format || image.format) !== 'png'

  const submit = (values: TransformForm) => {
    const transformations = buildTransformations(values, image.format)
    const empty = Object.keys(transformations).length === 0
    setEmptyError(empty)
    if (!empty) onSubmit(transformations)
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <Section title="Resize">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Width (px)" inputMode="numeric" placeholder={String(image.width)} error={errors.width?.message} {...register('width')} />
          <Input label="Height (px)" inputMode="numeric" placeholder={String(image.height)} error={errors.height?.message} {...register('height')} />
        </div>
        {bothDimensions && (
          <Select label="Fit" {...register('fit')}>
            {RESIZE_FITS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        )}
        <p className="text-xs text-slate-500">Leave one side empty to keep the aspect ratio.</p>
      </Section>

      <Section title="Crop">
        <Checkbox label={`Crop a region (image is ${image.width}×${image.height})`} {...register('cropEnabled')} />
        {cropEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Left" inputMode="numeric" error={errors.cropLeft?.message} {...register('cropLeft')} />
            <Input label="Top" inputMode="numeric" error={errors.cropTop?.message} {...register('cropTop')} />
            <Input label="Width" inputMode="numeric" error={errors.cropWidth?.message} {...register('cropWidth')} />
            <Input label="Height" inputMode="numeric" error={errors.cropHeight?.message} {...register('cropHeight')} />
          </div>
        )}
      </Section>

      <Section title="Rotate & flip">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-20">
            <Input label="Rotate (°)" inputMode="numeric" error={errors.rotate?.message} {...register('rotate')} />
          </div>
          {ROTATE_PRESETS.map((deg) => (
            <Button
              key={deg}
              size="sm"
              variant={rotate === deg ? 'primary' : 'secondary'}
              onClick={() => setValue('rotate', deg, { shouldValidate: true })}
            >
              {deg}°
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox label="Flip (vertical)" {...register('flip')} />
          <Checkbox label="Mirror (horizontal)" {...register('mirror')} />
        </div>
      </Section>

      <Section title="Filters">
        <div className="flex flex-wrap gap-4">
          <Checkbox label="Grayscale" {...register('grayscale')} />
          <Checkbox label="Sepia" {...register('sepia')} />
        </div>
      </Section>

      <Section title="Watermark">
        <Input label="Text" placeholder="Vazha Lomidze" maxLength={100} error={errors.watermarkText?.message} {...register('watermarkText')} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Position" {...register('watermarkPosition')}>
            {WATERMARK_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <div>
            <label htmlFor="wm-opacity" className="mb-1.5 block text-sm font-medium text-slate-700">
              Opacity: {Math.round(Number(opacity) * 100)}%
            </label>
            <input id="wm-opacity" type="range" min="0.1" max="1" step="0.1" className="w-full accent-indigo-600" {...register('watermarkOpacity')} />
          </div>
        </div>
      </Section>

      <Section title="Output">
        <Select label="Format" {...register('format')}>
          <option value="">Keep original ({image.format.toUpperCase()})</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
        </Select>
        {lossy && (
          <div>
            <label htmlFor="quality" className="mb-1.5 block text-sm font-medium text-slate-700">
              Quality: {quality}
            </label>
            <input id="quality" type="range" min="1" max="100" className="w-full accent-indigo-600" {...register('quality')} />
          </div>
        )}
        <Checkbox label="Stronger compression (smaller file, slower)" {...register('compress')} />
      </Section>

      {emptyError && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Choose at least one transformation.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={loading} className="flex-1">
          Apply transformations
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setEmptyError(false)
            reset({ ...DEFAULT_TRANSFORM_FORM, cropWidth: String(image.width), cropHeight: String(image.height) })
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  )
}
