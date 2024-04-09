import { readFile } from 'fs/promises';

interface IndexEntry {
    name: string;
    sha: string;
    type: 'file' | 'symlink' | 'gitlink';
    fileSize: number;
    ctime: Date;
    mtime: Date;
    dev: number;
    ino: number;
    unixPerm: string;
    uid: number;
    gid: number;
    assumeValidFlag: boolean;
    stage: number;
}

/**
 * Parse the index file of a git repository
 * https://git-scm.com/docs/index-format
 * @param repoPath Path to the .git folder
 * @returns An array of index entries
 */
export async function parseIndexFile(repoPath: string) {
    const buf = await readFile(`${repoPath}/index`);

    if (buf.subarray(0, 4).toString() !== 'DIRC') {
        throw new Error('Invalid index file. Header does not starts with "DIRC"');
    }
    const version = buf.readUInt32BE(4);
    if (version !== 2 && version !== 3) {
        throw new Error('Unsupported index file version. Only version 2 and 3 are supported');
    }

    const entriesCount = buf.readUInt32BE(8);
    const entries: IndexEntry[] = [];

    let entryStart = 12;
    for (let i = 0; i < entriesCount; i++) {
        const entry = buf.subarray(entryStart);

        const ctimeSeconds = entry.readUInt32BE(0);
        const ctimeNanoseconds = entry.readUInt32BE(4);
        const ctime = new Date(ctimeSeconds * 1000 + ctimeNanoseconds / 1e6);

        const mtimeSeconds = entry.readUInt32BE(8);
        const mtimeNanoseconds = entry.readUInt32BE(12);
        const mtime = new Date(mtimeSeconds * 1000 + mtimeNanoseconds / 1e6);

        const dev = entry.readUInt32BE(16);
        const ino = entry.readUInt32BE(20);
        const mode = entry.readUInt32BE(24);
        const binType = mode >> 12;
        const type = binType === 0b1000 ? 'file' : binType === 0b1010 ? 'symlink' : binType === 0b1110 ? 'gitlink' : undefined;
        if (type === undefined) {
            throw new Error('Unsupported index entry type');
        }
        const unixPerm = (mode & 0o777).toString(8).padStart(4, '0');
        if (unixPerm !== '0755' && unixPerm !== '0644') {
            throw new Error('Unsupported permission of index entry');
        }
        const uid = entry.readUInt32BE(28);
        const gid = entry.readUInt32BE(32);
        const fileSize = entry.readUInt32BE(36);
        const sha = entry.subarray(40, 60).toString('hex');
        const assumeValidFlag = entry.readUInt16BE(60) & 0b1000000000000000;
        const extendedFlag = entry.readUInt16BE(60) & 0b0100000000000000;
        const stage = entry.readUInt16BE(60) & 0b0011000000000000;
        const nameLength = entry.readUInt16BE(60) & 0b0000111111111111;

        let nameStart = 62;
        if (version > 2 && extendedFlag !== 0) {
            // const skipWorktreeFlag = entry.readUInt16BE(62) & 0b0100000000000000;
            // const intentToAddFlag = entry.readUInt16BE(62) & 0b0010000000000000;
            nameStart += 2;
        }

        let name = '';
        if (nameLength === 4095) {
            const nameBuf = entry.subarray(nameStart);
            name = nameBuf.subarray(0, nameBuf.indexOf('\x00')).toString();
        } else {
            name = entry.subarray(nameStart, nameStart + nameLength).toString();
        }

        entries.push({
            name,
            sha,
            type,
            fileSize,
            ctime,
            mtime,
            dev,
            ino,
            unixPerm,
            uid,
            gid,
            assumeValidFlag: !!assumeValidFlag,
            stage,
        });

        const padding = 8 - ((nameStart + nameLength) % 8);
        entryStart += nameStart + nameLength + padding;
    }
    return entries;
}
