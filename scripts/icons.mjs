// Regenerates the PWA icons. `pnpm icons` produces the base set (favicon, 64/192/512)
// from public/logo.svg; this script then renders full-bleed maskable/apple icons.
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const fullBleed = await readFile(new URL('./logo-fullbleed.svg', import.meta.url))

await sharp(fullBleed, { density: 300 }).resize(512, 512).png().toFile('public/maskable-icon-512x512.png')
await sharp(fullBleed, { density: 300 }).resize(180, 180).png().toFile('public/apple-touch-icon-180x180.png')
console.log('maskable + apple icons written')
