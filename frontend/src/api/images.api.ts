import { apiClient } from './client'
import type { ApiSuccess, Paginated } from '@/types/api'
import type { Image, ImageDetails, TransformResult, Transformations } from '@/types/image'

export const imagesApi = {
  async list(page: number, limit: number) {
    const { data } = await apiClient.get<Paginated<Image>>('/images', { params: { page, limit } })
    return data
  },

  async get(id: string) {
    const { data } = await apiClient.get<ApiSuccess<ImageDetails>>(`/images/${id}`)
    return data.data
  },

  async upload(file: File, onProgress?: (percent: number) => void) {
    const form = new FormData()
    form.append('image', file)
    const { data } = await apiClient.post<ApiSuccess<Image>>('/images', form, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
    return data.data
  },

  async transform(id: string, transformations: Transformations) {
    const { data } = await apiClient.post<ApiSuccess<TransformResult>>(`/images/${id}/transform`, {
      transformations,
    })
    return data.data
  },

  async remove(id: string) {
    await apiClient.delete(`/images/${id}`)
  },
}
