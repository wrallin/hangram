import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  scrypt,
  timingSafeEqual
} from 'node:crypto'

export const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

export interface KdfParams {
  algo: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
}

/** ~128 MiB of memory per guess: the only thing standing between a short PIN and a GPU. */
export const newKdfParams = (): KdfParams => ({
  algo: 'scrypt',
  N: 2 ** 17,
  r: 8,
  p: 1,
  salt: randomBytes(16).toString('base64')
})

export function deriveKey(secret: string, params: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      Buffer.from(secret.normalize('NFKC'), 'utf8'),
      Buffer.from(params.salt, 'base64'),
      KEY_BYTES,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r },
      (error, key) => (error ? reject(error) : resolve(key))
    )
  })
}

export function subkey(master: Buffer, info: string, salt: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.from(hkdfSync('sha256', master, salt, Buffer.from(info, 'utf8'), KEY_BYTES))
}

/** AES-256-GCM, output layout: nonce(12) | ciphertext | tag(16). */
export function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  return Buffer.concat([nonce, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
}

/** Throws when the key is wrong or the data was tampered with. */
export function open(key: Buffer, box: Buffer, aad: string): Buffer {
  if (box.length < NONCE_BYTES + TAG_BYTES) throw new Error('ciphertext too short')
  const decipher = createDecipheriv('aes-256-gcm', key, box.subarray(0, NONCE_BYTES))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(box.subarray(box.length - TAG_BYTES))
  return Buffer.concat([
    decipher.update(box.subarray(NONCE_BYTES, box.length - TAG_BYTES)),
    decipher.final()
  ])
}

export const equal = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b)

export { randomBytes }
