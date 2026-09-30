// Bundles the official Telegram Desktop build for the current platform into
// resources/telegram so that packaged builds ship with it (`npm run dist`).
import { join } from 'node:path'
import { type RuntimePlatform, fetchTelegram } from '../src/main/telegram/runtime-fetch'

const platform = (process.argv[2] ?? process.platform) as RuntimePlatform
const destination = process.argv[3] ?? join(__dirname, '..', 'resources', 'telegram')

let lastPercent = -1
fetchTelegram(platform, destination, (progress) => {
  if (progress.phase === 'download' && progress.total) {
    const percent = Math.floor((progress.received / progress.total) * 100)
    if (percent !== lastPercent && percent % 10 === 0) {
      lastPercent = percent
      console.log(`downloading Telegram Desktop… ${percent}%`)
    }
  } else if (progress.phase === 'install') {
    console.log('unpacking…')
  }
})
  .then((manifest) => console.log(`Telegram Desktop ${manifest.version} → ${destination}`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
