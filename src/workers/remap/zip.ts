export interface ZipEntryData {
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
    crc32: number;
    uncompressedSize: number;
    compressionMethod: 0 | 8;
}

interface CentralDirectoryEntry extends ZipEntryData {
    nameBytes: Uint8Array;
    offset: number;
}

const encoder = new TextEncoder();
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

export function writeZip(entries: ZipEntryData[]): Blob {
    const localParts: Uint8Array<ArrayBuffer>[] = [];
    const centralEntries: CentralDirectoryEntry[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);

        localView.setUint32(0, 0x04034B50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0x0800, true);
        localView.setUint16(8, entry.compressionMethod, true);
        localView.setUint16(10, DOS_TIME, true);
        localView.setUint16(12, DOS_DATE, true);
        localView.setUint32(14, entry.crc32, true);
        localView.setUint32(18, entry.bytes.length, true);
        localView.setUint32(22, entry.uncompressedSize, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        localParts.push(localHeader, entry.bytes);
        centralEntries.push({ ...entry, nameBytes, offset });
        offset += localHeader.length + entry.bytes.length;
    }

    const centralParts: Uint8Array<ArrayBuffer>[] = [];
    let centralSize = 0;

    for (const entry of centralEntries) {
        const centralHeader = new Uint8Array(46 + entry.nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);

        centralView.setUint32(0, 0x02014B50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, entry.compressionMethod, true);
        centralView.setUint16(12, DOS_TIME, true);
        centralView.setUint16(14, DOS_DATE, true);
        centralView.setUint32(16, entry.crc32, true);
        centralView.setUint32(20, entry.bytes.length, true);
        centralView.setUint32(24, entry.uncompressedSize, true);
        centralView.setUint16(28, entry.nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, entry.offset, true);
        centralHeader.set(entry.nameBytes, 46);

        centralParts.push(centralHeader);
        centralSize += centralHeader.length;
    }

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);

    return new Blob([...localParts, ...centralParts, end], { type: "application/java-archive" });
}
