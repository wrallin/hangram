// Renders build/icon.png (1024²) and, on macOS, build/icon.icns.  Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const out = path.join(__dirname, '..', 'build')
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3fb6ff"/><stop offset="1" stop-color="#1668e3"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcebff"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/>
  <rect x="300" y="250" width="470" height="300" rx="56" fill="#ffffff" opacity=".28"/>
  <rect x="254" y="330" width="516" height="330" rx="60" fill="#ffffff" opacity=".5"/>
  <rect x="208" y="416" width="608" height="360" rx="64" fill="url(#card)"/>
  <path fill="#1d7bea" d="M636 508 586 702c-4 14-13 17-25 10l-70-52-34 33c-4 4-7 7-14 7l5-71 130-117c6-5-1-8-9-3L409 610l-69-22c-15-5-15-15 3-22l270-104c13-5 26 3 23 18Z"/>
</svg>`

app.dock?.hide()
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } })
  await window.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`))
  await new Promise((resolve) => setTimeout(resolve, 300))
  const image = await window.webContents.capturePage()
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'icon.png'), image.resize({ width: 1024, height: 1024 }).toPNG())
  if (process.platform === 'darwin') {
    const set = path.join(out, 'icon.iconset')
    fs.rmSync(set, { recursive: true, force: true })
    fs.mkdirSync(set)
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
        fs.writeFileSync(path.join(set, name), image.resize({ width: size * scale, height: size * scale, quality: 'best' }).toPNG())
      }
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(out, 'icon.icns')])
    fs.rmSync(set, { recursive: true, force: true })
  }
  app.quit()
})
