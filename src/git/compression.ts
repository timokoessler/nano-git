import { readFile } from 'fs/promises';
import { promisify } from 'util';
import * as zlib from 'zlib';

const inflate = promisify(zlib.inflate);
const deflate = promisify(zlib.deflate);

export async function readCompressedFile(filePath: string): Promise<Buffer> {
    const fileContent = await readFile(filePath);
    return await inflate(fileContent);
}

export async function decompressObject(data: Buffer): Promise<Buffer> {
    return await inflate(data);
}

export async function compressObject(data: Buffer): Promise<Buffer> {
    return await deflate(data);
}
