import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { imagesApi } from '@/api/images.api'

export const imageKeys = {
  all: ['images'] as const,
  list: (page: number, limit: number) => [...imageKeys.all, 'list', page, limit] as const,
  detail: (id: string) => [...imageKeys.all, 'detail', id] as const,
}

// Presigned URLs expire after 15 minutes; refetch well before that.
const URL_SAFE_STALE_TIME = 5 * 60 * 1000

export function useImages(page: number, limit: number) {
  return useQuery({
    queryKey: imageKeys.list(page, limit),
    queryFn: () => imagesApi.list(page, limit),
    placeholderData: keepPreviousData,
    staleTime: URL_SAFE_STALE_TIME,
    refetchInterval: URL_SAFE_STALE_TIME * 2,
  })
}

export function useImage(id: string) {
  return useQuery({
    queryKey: imageKeys.detail(id),
    queryFn: () => imagesApi.get(id),
    staleTime: URL_SAFE_STALE_TIME,
    refetchInterval: URL_SAFE_STALE_TIME * 2,
  })
}
