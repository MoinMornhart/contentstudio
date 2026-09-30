import type { CsApi } from '../shared/app'

declare global {
  interface Window {
    cs: CsApi
  }
}

export {}
