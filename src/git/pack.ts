import { readFile } from 'fs/promises';
import { checkFileExists } from './fs-helpers.js';
import { numToObjType } from './object.js';
import { decompressObject } from './compression.js';

export async function findObjectInPackIndex(repoPath: string, packSha: string, sha: string) {
    const indexFile = `${repoPath}/objects/pack/pack-${packSha}.idx`;
    if (!(await checkFileExists(indexFile))) {
        throw new Error(`Pack index file ${indexFile} not found`);
    }
    const buf = await readFile(indexFile);
    const header = buf.subarray(0, 4).toString('hex');
    // Magic number for pack index file \377tOc
    if (header !== 'ff744f63') {
        throw new Error('Invalid pack index file');
    }
    const version = buf.readUInt32BE(4);
    if (version !== 2) {
        throw new Error('Unsupported pack index version. Only version 2 is supported.');
    }

    let offset = 8; // 4 bytes for header, 4 bytes for version

    // Read fan-out table
    // The fan-out table is a table of 256 4-byte entries, one for each possible byte value
    // The n-th entry is the number of objects in the packfile that start with a byte value of n or less
    const fanoutTable: number[] = [];
    for (let i = 0; i < 256; i++) {
        const count = buf.readUInt32BE(offset);
        fanoutTable.push(count);
        offset += 4;
    }

    const prefixNumber = parseInt(sha.substring(0, 2), 16);
    const sha1Length = 20; // bytes

    // Determine the start position in the packfile based on the fan-out table
    let startOffset = offset + (prefixNumber > 0 ? fanoutTable[prefixNumber - 1] : 0) * sha1Length;
    let endOffset = offset + fanoutTable[prefixNumber] * sha1Length;

    // Binary search the pack index to find the sha
    while (startOffset < endOffset) {
        const mid = startOffset + Math.floor((endOffset - startOffset) / sha1Length / 2) * sha1Length;
        const midSha = buf.subarray(mid, mid + sha1Length).toString('hex');
        if (midSha < sha) {
            startOffset = mid + sha1Length;
        } else if (midSha > sha) {
            endOffset = mid;
        } else {
            // Found the sha
            break;
        }
    }
    if (startOffset >= endOffset) {
        return null;
    }

    const index = (startOffset - offset) / sha1Length;

    const checksumTableOffset = 8 + 256 * 4 + fanoutTable[255] * sha1Length;
    const crc32Checksum = buf.readUInt32BE(checksumTableOffset + index * 4);

    const offsetTableOffset = checksumTableOffset + fanoutTable[255] * 4;
    const dataOffset = buf.readUInt32BE(offsetTableOffset + index * 4);

    // Check if the MSB (most significant bit) is set
    const msbIsSet = !!(dataOffset & 0x80000000);
    if (msbIsSet) {
        throw new Error('Packfiles that are larger than 2GiB are not supported yet');
    }

    return {
        crc32Checksum,
        dataOffset,
    };
}

export async function getObjectFromPack(repoPath: string, packSha: string, index: { crc32Checksum: number; dataOffset: number }) {
    const packFile = `${repoPath}/objects/pack/pack-${packSha}.pack`;
    if (!(await checkFileExists(packFile))) {
        throw new Error(`Pack file ${packFile} not found`);
    }
    const buf = await readFile(packFile);
    if (buf.subarray(0, 4).toString() !== 'PACK') {
        throw new Error('Invalid pack file. Header does not starts with "PACK"');
    }
    const version = buf.readUInt32BE(4);
    if (version !== 2) {
        throw new Error('Unsupported pack file version. Only version 2 is supported.');
    }
    // const objectCount = buf.readUInt32BE(8);

    const parseVarSize = (startOffset: number) => {
        let result = 0;
        let shift = 4;
        let length = 1;
        result = buf.readUint8(startOffset) & 15;
        while (true) {
            const byte = buf.readUint8(++startOffset);
            length++;
            result |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) {
                break;
            }
            shift += 7;
        }

        return { size: result, typeAndSizeLength: length };
    };

    const typeAndSize = buf.readUInt8(index.dataOffset);
    // Second to fourth bits are the type, so we shift the byte 4 bits to the right and then mask the result with 0x07 to ignore the first bit
    const type = (typeAndSize >> 4) & 7;
    if (type <= 0 || type > 7) {
        throw new Error(`Invalid object type ${type} in pack file`);
    }
    console.log(`Type: ${type}`);
    const { size, typeAndSizeLength } = parseVarSize(index.dataOffset);
    console.log(`Size: ${size}`);

    return {
        type: numToObjType(type),
        size,
        data: await decompressObject(buf.subarray(index.dataOffset + typeAndSizeLength)),
    };
}
