import type { AxiosResponse } from 'axios'

export function saveBlobResponse(response: AxiosResponse<Blob>, fallbackFilename: string) {
  const disposition = response.headers['content-disposition'] as string | undefined
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename
  const contentType = response.headers['content-type']
  const blob = new Blob([response.data], {
    type: typeof contentType === 'string' ? contentType : 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
