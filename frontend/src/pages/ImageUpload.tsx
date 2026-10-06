import { ImageUploader } from '@/components/images/ImageUploader'
import { PageHeader } from '@/components/ui/PageHeader'

export default function ImageUpload() {
  return (
    <>
      <PageHeader title="Upload image" description="Images are stored privately; only you can see them." />
      <div className="max-w-2xl">
        <ImageUploader />
      </div>
    </>
  )
}
