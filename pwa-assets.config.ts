import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.18, resizeOptions: { background: '#1b2a41' } },
    apple: { ...minimal2023Preset.apple, padding: 0.12, resizeOptions: { background: '#1b2a41' } },
  },
  images: ['public/logo.svg'],
})
