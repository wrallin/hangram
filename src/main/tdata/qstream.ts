/** Minimal QDataStream (big-endian) reader/writer — just what tdata needs. */

export class QReader {
  private offset = 0
  constructor(private readonly buffer: Buffer) {}

  get atEnd(): boolean {
    return this.offset >= this.buffer.length
  }

  private take(size: number): Buffer {
    if (this.offset + size > this.buffer.length) throw new Error('unexpected end of stream')
    const slice = this.buffer.subarray(this.offset, this.offset + size)
    this.offset += size
    return slice
  }

  int32 = (): number => this.take(4).readInt32BE()
  uint32 = (): number => this.take(4).readUInt32BE()
  uint64 = (): bigint => this.take(8).readBigUInt64BE()
  raw = (size: number): Buffer => this.take(size)

  bytes(): Buffer {
    const length = this.uint32()
    // 0xFFFFFFFF encodes a null QByteArray.
    return length === 0xffffffff ? Buffer.alloc(0) : this.take(length)
  }
}

export class QWriter {
  private readonly parts: Buffer[] = []

  int32(value: number): this {
    const b = Buffer.alloc(4)
    b.writeInt32BE(value)
    this.parts.push(b)
    return this
  }

  uint32(value: number): this {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(value)
    this.parts.push(b)
    return this
  }

  uint64(value: bigint): this {
    const b = Buffer.alloc(8)
    b.writeBigUInt64BE(value)
    this.parts.push(b)
    return this
  }

  raw(value: Buffer): this {
    this.parts.push(value)
    return this
  }

  bytes(value: Buffer): this {
    return this.uint32(value.length).raw(value)
  }

  done = (): Buffer => Buffer.concat(this.parts)
}
