import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage } from '@/api/client'
import { imagesApi } from '@/api/images.api'
import { imageKeys } from './useImages'
import { useToast } from './useToast'

export function useDeleteImage(onDeleted?: () => void) {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (id: string) => imagesApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: imageKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: imageKeys.all })
      toast.success('Image and all its versions deleted.')
      onDeleted?.()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
