/** Returns the view's exact bytes, reusing a complete ArrayBuffer for read-only consumers. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
        return bytes.buffer;
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}
