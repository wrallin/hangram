/**
 * Telegram Desktop local storage primitives (see tdesktop: storage/details/
 * storage_file_utilities.cpp and mtproto/mtproto_auth_key.cpp).
 */
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'

export const LOCAL_KEY_BYTES = 256
const BLOCK = 16

const sha1 = (...parts: Buffer[]): Buffer => {
  const hash = createHash('sha1')
  parts.forEach((part) => hash.update(part))
  return hash.digest()
}

const xorBlock = (a: Buffer, b: Buffer): Buffer => {
  const out = Buffer.allocUnsafe(BLOCK)
  for (let i = 0; i < BLOCK; i++) out[i] = a[i]! ^ b[i]!
  return out
}

/** AES-256 in Infinite Garble Extension mode; `iv` is 32 bytes (c0 | p0). */
export function aesIge(data: Buffer, key: Buffer, iv: Buffer, encrypt: boolean): Buffer {
  if (data.length % BLOCK !== 0) throw new Error('IGE input is not block aligned')
  const ecb = encrypt
    ? createCipheriv('aes-256-ecb', key, null)
    : createDecipheriv('aes-256-ecb', key, null)
  ecb.setAutoPadding(false)
  const out = Buffer.allocUnsafe(data.length)
  // For encryption: prevOut = previous ciphertext, prevIn = previous plaintext (and vice versa).
  let prevOut = encrypt ? iv.subarray(0, BLOCK) : iv.subarray(BLOCK, 2 * BLOCK)
  let prevIn = encrypt ? iv.subarray(BLOCK, 2 * BLOCK) : iv.subarray(0, BLOCK)
  for (let offset = 0; offset < data.length; offset += BLOCK) {
    const input = data.subarray(offset, offset + BLOCK)
    const output = xorBlock(ecb.update(xorBlock(input, prevOut)), prevIn)
    output.copy(out, offset)
    prevOut = output
    prevIn = input
  }
  return out
}

/** MTProto 1.0 key derivation as used for local data (the "x = 8" half of the key). */
function deriveAes(localKey: Buffer, msgKey: Buffer): { key: Buffer; iv: Buffer } {
  const x = 8
  const a = sha1(msgKey, localKey.subarray(x, x + 32))
  const b = sha1(localKey.subarray(x + 32, x + 48), msgKey, localKey.subarray(x + 48, x + 64))
  const c = sha1(localKey.subarray(x + 64, x + 96), msgKey)
  const d = sha1(msgKey, localKey.subarray(x + 96, x + 128))
  return {
    key: Buffer.concat([a.subarray(0, 8), b.subarray(8, 20), c.subarray(4, 16)]),
    iv: Buffer.concat([a.subarray(8, 20), b.subarray(0, 8), c.subarray(16, 20), d.subarray(0, 8)])
  }
}

/** Key protecting `key_datas`; with an empty passcode it is derivable by anyone. */
export function createLocalKey(passcode: string, salt: Buffer): Buffer {
  const pass = Buffer.from(passcode, 'utf8')
  const hashKey = createHash('sha512').update(salt).update(pass).update(salt).digest()
  return pbkdf2Sync(hashKey, salt, pass.length === 0 ? 1 : 100_000, LOCAL_KEY_BYTES, 'sha512')
}

/** Output: msgKey(16) | IGE(u32le(size) | payload | random padding). */
export function encryptLocal(payload: Buffer, localKey: Buffer): Buffer {
  const size = 4 + payload.length
  const padded = Buffer.concat([Buffer.alloc(4), payload, randomBytes((BLOCK - (size % BLOCK)) % BLOCK)])
  padded.writeUInt32LE(size, 0)
  const msgKey = sha1(padded).subarray(0, 16)
  const { key, iv } = deriveAes(localKey, msgKey)
  return Buffer.concat([msgKey, aesIge(padded, key, iv, true)])
}

/** Returns the payload, or null when the key is wrong / the data is damaged. */
export function decryptLocal(encrypted: Buffer, localKey: Buffer): Buffer | null {
  if (encrypted.length <= 16 || (encrypted.length - 16) % BLOCK !== 0) return null
  const msgKey = encrypted.subarray(0, 16)
  const { key, iv } = deriveAes(localKey, msgKey)
  const decrypted = aesIge(encrypted.subarray(16), key, iv, false)
  if (!sha1(decrypted).subarray(0, 16).equals(msgKey)) return null
  const size = decrypted.readUInt32LE(0)
  if (size < 4 || size > decrypted.length || size <= decrypted.length - BLOCK) return null
  return decrypted.subarray(4, size)
}
