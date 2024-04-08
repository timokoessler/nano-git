import { readCompressedFile } from './compression.js';
import { checkFileExists } from './fs-helpers.js';
import { getObjectFromAnyPack } from './pack.js';

export async function getObject(repoPath: string, sha: string) {
    const blobPath = `${repoPath}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
    if (await checkFileExists(blobPath)) {
        const buf = await readCompressedFile(blobPath);
        const headerEnd = buf.indexOf('\x00');
        if (headerEnd === -1) {
            throw new Error('Blob header is malformed');
        }
        const header = buf.subarray(0, headerEnd).toString();
        const content = buf.subarray(headerEnd + 1);
        return { header, content };
    }
    const packObject = await getObjectFromAnyPack(repoPath, sha);
    if (packObject === null) {
        throw new Error(`Object ${sha} not found`);
    }
    return {
        header: `${packObject.type} ${packObject.size}\x00`,
        content: packObject.data,
    };
}

export function numToObjType(type: number) {
    switch (type) {
        case 1:
            return 'commit';
        case 2:
            return 'tree';
        case 3:
            return 'blob';
        case 4:
            return 'tag';
        case 5:
            throw new Error('This is reserved for future use');
        case 6:
            return 'ofs-delta';
        case 7:
            return 'ref-delta';
        default:
            throw new Error(`Unknown object type ${type}`);
    }
}
