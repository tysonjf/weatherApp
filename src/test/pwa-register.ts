import { useState } from 'react'

/** Stand-in for vite-plugin-pwa's virtual module: no service worker in tests. */
export function useRegisterSW(_options?: unknown) {
  return {
    offlineReady: useState(false),
    needRefresh: useState(false),
    updateServiceWorker: async (_reload?: boolean) => {},
  }
}
