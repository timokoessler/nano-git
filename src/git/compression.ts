import { readFile } from 'fs/promises';
import { promisify } from 'util';
import * as zlib from 'zlib';
const inflate = promisify(zlib.inflate);

export async function readCompressedFile(filePath: string): Promise<Buffer> {
    const fileContent = await readFile(filePath);
    return await inflate(fileContent);
}
