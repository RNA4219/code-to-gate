/**
 * Simple ZIP Utilities - No external dependencies
 * Basic ZIP file creation and parsing for evidence bundles
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * Calculate CRC32 checksum for data
 */
export function crc32(data: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a simple ZIP file from entries
 * Note: This is a basic implementation without compression
 */
export function createZipFile(entries: ZipEntry[]): Buffer {
  const localFileHeaders: Buffer[] = [];
  const centralDirectoryHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    // Local file header (version 2.0, no compression)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed
    localHeader.writeUInt16LE(0, 6); // General purpose flag
    localHeader.writeUInt16LE(0, 8); // Compression method (stored)
    localHeader.writeUInt16LE(0, 10); // Last mod time
    localHeader.writeUInt16LE(0, 12); // Last mod date
    localHeader.writeUInt32LE(entry.crc32, 14); // CRC-32
    localHeader.writeUInt32LE(entry.compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(entry.uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(entry.name.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    const filenameBuffer = Buffer.from(entry.name, "utf8");
    localFileHeaders.push(Buffer.concat([localHeader, filenameBuffer, entry.data]));

    // Central directory header
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // General purpose flag
    centralHeader.writeUInt16LE(0, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12); // Last mod time
    centralHeader.writeUInt16LE(0, 14); // Last mod date
    centralHeader.writeUInt32LE(entry.crc32, 16); // CRC-32
    centralHeader.writeUInt32LE(entry.compressedSize, 20); // Compressed size
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(entry.name.length, 28); // Filename length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset

    centralDirectoryHeaders.push(Buffer.concat([centralHeader, filenameBuffer]));

    offset += localHeader.length + filenameBuffer.length + entry.data.length;
  }

  // End of central directory
  const centralDirOffset = offset;
  const centralDirSize = centralDirectoryHeaders.reduce((sum, h) => sum + h.length, 0);

  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // Signature
  endOfCentralDir.writeUInt16LE(0, 4); // Disk number
  endOfCentralDir.writeUInt16LE(0, 6); // Disk with central directory
  endOfCentralDir.writeUInt16LE(entries.length, 8); // Entries on this disk
  endOfCentralDir.writeUInt16LE(entries.length, 10); // Total entries
  endOfCentralDir.writeUInt32LE(centralDirSize, 12); // Central directory size
  endOfCentralDir.writeUInt32LE(centralDirOffset, 16); // Central directory offset
  endOfCentralDir.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([
    ...localFileHeaders,
    ...centralDirectoryHeaders,
    endOfCentralDir,
  ]);
}

/**
 * Parse a simple ZIP file and extract entries
 */
export function parseZipFile(zipData: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset < zipData.length - 22) {
    const signature = zipData.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      // Local file header
      const filenameLen = zipData.readUInt16LE(offset + 26);
      const extraLen = zipData.readUInt16LE(offset + 28);
      const compressedSize = zipData.readUInt32LE(offset + 18);
      const uncompressedSize = zipData.readUInt32LE(offset + 22);

      const dataSize = compressedSize === 0 ? uncompressedSize : compressedSize;

      const filenameStart = offset + 30;
      const filename = zipData.toString("utf8", filenameStart, filenameStart + filenameLen);
      const dataStart = filenameStart + filenameLen + extraLen;
      const data = zipData.subarray(dataStart, dataStart + dataSize);

      entries.set(filename, data);

      offset = dataStart + dataSize;
    } else if (signature === 0x02014b50) {
      // Central directory header - skip
      const filenameLen = zipData.readUInt16LE(offset + 28);
      const extraLen = zipData.readUInt16LE(offset + 30);
      const commentLen = zipData.readUInt16LE(offset + 32);
      offset += 46 + filenameLen + extraLen + commentLen;
    } else if (signature === 0x06054b50) {
      // End of central directory - done
      break;
    } else {
      offset += 1;
    }
  }

  return entries;
}

/**
 * Create a ZIP entry from name and data
 */
export function createZipEntry(name: string, data: Buffer): ZipEntry {
  return {
    name,
    data,
    crc32: crc32(data),
    compressedSize: data.length,
    uncompressedSize: data.length,
  };
}