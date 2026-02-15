import { read, type Entry, type Reader, type Zip, readBlob } from "@katana-project/zip";

export interface Jar {
  name: string;
  blob: Blob;
  entries: { [key: string]: Entry };
}

export async function openJar(name: string, blob: Blob): Promise<Jar> {
  const zip = await readBlob(blob, {
    naive: true,
  });
  return new JarImpl(name, blob, zip);
}

// TODO: fix
// export async function streamJar(name: string, url: string): Promise<Jar> {
//     const reader = new HttpStreamReader(url);
//     const zip = await read(reader, {
//         naive: true
//     });
//     return new JarImpl(name, zip);
// }

class JarImpl implements Jar {
  private zip: Zip;
  public name: string;
  public blob: Blob;
  public entries: { [key: string]: Entry } = {};

  constructor(name: string, blob: Blob, zip: Zip) {
    this.name = name;
    this.blob = blob;
    this.zip = zip;
    zip.entries.forEach((entry) => {
      this.entries[entry.name] = entry;
    });
  }
}

class HttpStreamReader implements Reader {
  private url: string;

  private _lengthCache: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async length(): Promise<number> {
    if (this._lengthCache !== null) {
      return Promise.resolve(this._lengthCache);
    }

    const response = await fetch(this.url, { method: "HEAD" });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch HEAD for ${this.url}: ${response.status} ${response.statusText}`,
      );
    }

    const lengthHeader = response.headers.get("Content-Length");

    if (!lengthHeader) {
      throw new Error(`Content-Length header is missing for ${this.url}`);
    }

    return Promise.resolve((this._lengthCache = parseInt(lengthHeader)));
  }

  async read(offset: number, size: number): Promise<Uint8Array> {
    const response = await this.fetchRange(offset, size);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async slice(offset: number, size: number): Promise<Blob> {
    const response = await this.fetchRange(offset, size);
    return response.blob();
  }

  async fetchRange(offset: number, size: number): Promise<Response> {
    const request = await fetch(this.url, {
      headers: {
        Range: `bytes=${offset}-${offset + size - 1}`,
      },
      cache: "no-store",
    });

    if (!request.ok && request.status !== 206) {
      throw new Error(
        `Failed to fetch range ${offset}-${offset + size - 1} for ${this.url}: ${request.status} ${request.statusText}`,
      );
    }

    // check size
    if (request.headers.has("Content-Length")) {
      const contentLength = parseInt(request.headers.get("Content-Length")!);
      if (contentLength !== size) {
        console.warn(
          `Fetched range size mismatch for ${this.url}: expected ${size}, got ${contentLength}`,
        );
      }
    }

    return request;
  }
}
