import type { ReactElement } from 'react'
import type { Account } from '@shared/types'
import { displayName } from '../store'

// Telegram's own peer colour pairs.
const GRADIENTS = [
  ['#ff885e', '#ff516a'],
  ['#ffcd6a', '#ffa85c'],
  ['#82b1ff', '#665fff'],
  ['#a0de7e', '#54cb68'],
  ['#53edd6', '#28c9b7'],
  ['#72d5fd', '#2a9ef1'],
  ['#e0a2f3', '#d669ed']
] as const

function hash(value: string): number {
  let result = 0
  for (let i = 0; i < value.length; i++) result = (result * 31 + value.charCodeAt(i)) | 0
  return Math.abs(result)
}

function initials(name: string): string {
  const words = name.replace(/[@+]/g, '').split(/\s+/).filter(Boolean)
  const letters = words.length >= 2 ? [words[0]![0], words[1]![0]] : [Array.from(words[0] ?? '?')[0]]
  return letters.join('').toUpperCase()
}

export function Avatar({ account, size = 36 }: { account: Account; size?: number }): ReactElement {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  if (account.avatarVersion) {
    return (
      <img
        className="avatar"
        style={style}
        src={`hangram-avatar://a/${account.id}?v=${account.avatarVersion}`}
        alt=""
        draggable={false}
      />
    )
  }
  const [from, to] = GRADIENTS[hash(account.userId || account.id) % GRADIENTS.length]!
  return (
    <div className="avatar" style={{ ...style, background: `linear-gradient(${from}, ${to})` }} aria-hidden="true">
      {initials(displayName(account))}
    </div>
  )
}
