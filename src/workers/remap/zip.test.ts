import { describe, expect, it } from 'vitest';
import { readBlob } from '@katana-project/zip';
import { crc32 } from './crc32';
import { writeZip } from './zip';

describe('writeZip', () => {
    it('writes compressed class entries that can be read back', async () => {
        const classBytes = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE, 0x00, 0x00, 0x00, 0x41]);
        const compressedBytes = new Uint8Array([59, 245, 111, 215, 62, 6, 6, 6, 71, 0]);

        const blob = writeZip([{
            name: 'net/minecraft/ChatFormatting.class',
            bytes: compressedBytes,
            crc32: crc32(classBytes),
            uncompressedSize: classBytes.length,
            compressionMethod: 8,
        }]);

        const zip = await readBlob(blob, { naive: true });
        expect(zip.entries).toHaveLength(1);
        expect(zip.entries[0].name).toBe('net/minecraft/ChatFormatting.class');
        expect(zip.entries[0].crc32).toBe(crc32(classBytes));
        expect(zip.entries[0].uncompressedSize).toBe(classBytes.length);
        expect(await zip.entries[0].bytes()).toEqual(classBytes);
    });
});
