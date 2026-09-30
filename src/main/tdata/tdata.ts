/**
 * Reads and writes the part of a Telegram Desktop `tdata` folder that identifies
 * accounts: key_datas (local key + account index) and the per-account MTP file
 * (user id, main DC, authorization keys).
 */
import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { LOCAL_KEY_BYTES, createLocalKey, decryptLocal, encryptLocal } from './local-crypto'
import { QReader, QWriter } from './qstream'
import { readTdf, writeTdf } from './tdf'

const AUTH_KEY_BYTES = 256
const DBI_MTP_AUTHORIZATION = 0x4b
const WIDE_IDS_TAG = 0xffffffffffffffffn
const MAX_ACCOUNTS = 6

export interface TdataAccount {
  index: number
  userId: bigint
  dcId: number
  authKey: Buffer
}

export type TdataStatus = 'ok' | 'empty' | 'passcode' | 'corrupt'

export interface TdataInfo {
  status: TdataStatus
  accounts: TdataAccount[]
}

/** File-name stem Telegram derives for account `index`: "D877F783D5D3EF8C" for the first. */
export function accountFileStem(index: number): string {
  const dataName = index === 0 ? 'data' : `data#${index + 1}`
  const md5 = createHash('md5').update(dataName, 'utf8').digest()
  let stem = ''
  for (let i = 0; i < 8; i++) {
    const byte = md5[i]!
    stem += (byte & 0x0f).toString(16) + (byte >> 4).toString(16)
  }
  return stem.toUpperCase()
}

function parseAuthorization(serialized: Buffer): Omit<TdataAccount, 'index'> | null {
  const stream = new QReader(serialized)
  let userId: bigint
  let dcId: number
  const legacyUserId = stream.uint32()
  const legacyDcId = stream.uint32()
  if (((BigInt(legacyUserId) << 32n) | BigInt(legacyDcId)) === WIDE_IDS_TAG) {
    userId = stream.uint64()
    dcId = stream.int32()
  } else {
    userId = BigInt(legacyUserId)
    dcId = legacyDcId
  }
  const keys = new Map<number, Buffer>()
  const count = stream.int32()
  for (let i = 0; i < count; i++) {
    const keyDc = stream.int32()
    keys.set(keyDc, Buffer.from(stream.raw(AUTH_KEY_BYTES)))
  }
  const authKey = keys.get(dcId)
  return authKey && userId !== 0n ? { userId, dcId, authKey } : null
}

async function readAccount(tdataDir: string, index: number, localKey: Buffer): Promise<TdataAccount | null> {
  const file = await readTdf(join(tdataDir, accountFileStem(index)))
  if (!file) return null
  const decrypted = decryptLocal(new QReader(file).bytes(), localKey)
  if (!decrypted) return null
  const blocks = new QReader(decrypted)
  while (!blocks.atEnd) {
    // Only the authorization block ever appears in this file; anything else ends the scan.
    if (blocks.uint32() !== DBI_MTP_AUTHORIZATION) break
    const parsed = parseAuthorization(blocks.bytes())
    if (parsed) return { index, ...parsed }
  }
  return null
}

export async function readTdata(tdataDir: string, passcode = ''): Promise<TdataInfo> {
  const keyFile = await readTdf(join(tdataDir, 'key_data'))
  if (!keyFile) return { status: 'empty', accounts: [] }
  try {
    const stream = new QReader(keyFile)
    const salt = stream.bytes()
    const keyEncrypted = stream.bytes()
    const infoEncrypted = stream.bytes()

    const localKey = decryptLocal(keyEncrypted, createLocalKey(passcode, salt))
    if (!localKey || localKey.length !== LOCAL_KEY_BYTES) return { status: 'passcode', accounts: [] }
    const info = decryptLocal(infoEncrypted, localKey)
    if (!info) return { status: 'corrupt', accounts: [] }

    const infoStream = new QReader(info)
    const count = infoStream.int32()
    if (count < 0 || count > MAX_ACCOUNTS) return { status: 'corrupt', accounts: [] }
    const accounts: TdataAccount[] = []
    for (let i = 0; i < count; i++) {
      const account = await readAccount(tdataDir, infoStream.int32(), localKey)
      if (account) accounts.push(account)
    }
    return { status: accounts.length > 0 ? 'ok' : 'empty', accounts }
  } catch {
    return { status: 'corrupt', accounts: [] }
  }
}

/** Creates a fresh single-account tdata that Telegram Desktop opens as a logged-in session. */
export async function writeTdata(
  tdataDir: string,
  account: { userId: bigint; dcId: number; authKey: Buffer }
): Promise<void> {
  if (account.authKey.length !== AUTH_KEY_BYTES) throw new Error('auth key must be 256 bytes')
  const stem = accountFileStem(0)
  await fs.mkdir(join(tdataDir, stem), { recursive: true })

  const localKey = randomBytes(LOCAL_KEY_BYTES)
  const salt = randomBytes(32)

  const authorization = new QWriter()
    .uint64(WIDE_IDS_TAG)
    .uint64(account.userId)
    .int32(account.dcId)
    .int32(1)
    .int32(account.dcId)
    .raw(account.authKey)
    .int32(0)
    .done()
  const mtp = new QWriter().uint32(DBI_MTP_AUTHORIZATION).bytes(authorization).done()
  await writeTdf(join(tdataDir, stem), new QWriter().bytes(encryptLocal(mtp, localKey)).done())

  // An empty storage map: no legacy salt, no legacy key, no entries.
  const map = new QWriter()
    .bytes(Buffer.alloc(0))
    .bytes(Buffer.alloc(0))
    .bytes(encryptLocal(Buffer.alloc(0), localKey))
    .done()
  await writeTdf(join(tdataDir, stem, 'map'), map)

  // One account at index 0, which is also the active one. Written last: it makes the
  // folder "valid", so a crash before this point leaves nothing half-usable behind.
  const info = new QWriter().int32(1).int32(0).int32(0).done()
  const keyData = new QWriter()
    .bytes(salt)
    .bytes(encryptLocal(localKey, createLocalKey('', salt)))
    .bytes(encryptLocal(info, localKey))
    .done()
  await writeTdf(join(tdataDir, 'key_data'), keyData)
}
