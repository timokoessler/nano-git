import { warn } from 'console';
import { readFile, readdir } from 'fs/promises';
import { Tree, getTree } from './object';
import { GitIgnoreParser } from './git-ignore';
import { relative, resolve } from 'path';

export interface GitIndex {
    entries: IndexEntry[];
    treeExtension: CacheTreeEntry;
}

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

interface CacheTreeEntry {
    path: string;
    entryCount: number;
    subTreeCount: number;
    sha: string;
    subEntries: CacheTreeEntry[];
}

/**
 * Parse the index file of a git repository
 * https://git-scm.com/docs/index-format
 * @param repoPath Path to the .git folder
 * @returns An array of index entries
 */
export async function parseIndexFile(repoPath: string): Promise<GitIndex> {
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
            // Ignored for now
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

    let treeExtension: CacheTreeEntry;

    // Parse extensions
    let extensionStart = entryStart;
    while (extensionStart < buf.length - 20) {
        const extensionSignature = buf.subarray(extensionStart, extensionStart + 4).toString();
        const extensionLength = buf.readUInt32BE(extensionStart + 4);
        if (extensionSignature === 'TREE') {
            // Disabled for now because it seems not to work if files are staged?
            //treeExtension = parseTreeExtensionData(buf.subarray(extensionStart + 8, extensionStart + 8 + extensionLength));
        } else {
            warn(`Unsupported index extension with signature ${extensionSignature}`);
        }
        extensionStart += 8 + extensionLength;
    }

    return {
        entries,
        treeExtension,
    };
}

function parseTreeExtensionData(extension: Buffer): CacheTreeEntry {
    let entryStart = 0;

    const entries: CacheTreeEntry[] = [];

    while (entryStart < extension.length - 5) {
        const entry = extension.subarray(entryStart);
        const path = entry.subarray(0, entry.indexOf('\x00')).toString();
        const spaceIndex = entry.indexOf(' ');
        const entryCount = parseInt(entry.subarray(path.length + 1, spaceIndex).toString('ascii'));
        if (isNaN(entryCount)) {
            throw new Error('Invalid entry count in tree extension');
        }

        const newLineIndex = entry.indexOf('\n');

        // If the entry count is -1 the entry is invalidated and the next entry starts after the new line character
        if (entryCount === -1) {
            entryStart += newLineIndex + 1;
            continue;
        }

        const subTreeCount = parseInt(entry.subarray(spaceIndex + 1, newLineIndex).toString('ascii'));
        if (isNaN(subTreeCount)) {
            throw new Error('Invalid sub tree count in tree extension');
        }
        const sha = entry.subarray(newLineIndex + 1, newLineIndex + 21).toString('hex');

        entries.push({
            path,
            sha,
            entryCount,
            subEntries: [],
            subTreeCount,
        });
        entryStart += newLineIndex + 21;
    }

    if (entries.length === 0) {
        throw new Error('No entries found in tree extension');
    }

    if (entries[0].path !== '') {
        throw new Error('First entry in tree extension is not the root');
    }

    // Todo: Nest to tree structure

    return entries[0];
}

interface WorkingDirFileStatus {
    name: string;
    hash: string;
    status: 'staged' | 'modified' | 'untracked';
    stagingStatus?: 'added' | 'modified' | 'deleted';
}

async function getAllTreeObjects(repoPath: string, tree: Tree, result: { mode: number; name: string; sha: string }[], path: string = '') {
    for (const entry of tree.entries) {
        if (entry.mode === 40000) {
            await getAllTreeObjects(repoPath, await getTree(repoPath, entry.sha), result, `${path}${entry.name}/`);
            continue;
        }
        result.push({ mode: entry.mode, name: `${path}${entry.name}`, sha: entry.sha });
    }
}

export async function getWorkingDirStatus(
    repoPath: string,
    index: GitIndex,
    rootTree: Tree,
    ignoreParser: GitIgnoreParser,
): Promise<WorkingDirFileStatus[]> {
    const changes: WorkingDirFileStatus[] = [];

    const treeEntries: { mode: number; name: string; sha: string }[] = [];

    await getAllTreeObjects(repoPath, rootTree, treeEntries);

    for (const entry of index.entries) {
        const existing = treeEntries.find((treeEntry) => treeEntry.name === entry.name);
        if (existing === undefined || existing.sha !== entry.sha) {
            changes.push({
                name: entry.name,
                hash: entry.sha,
                status: 'staged',
                stagingStatus: existing === undefined ? 'added' : 'modified',
            });
            continue;
        }
    }

    // console.log(await getAllNonIgnoredFiles(repoPath, ignoreParser));

    return changes;
}

async function getAllNonIgnoredFiles(repoPath: string, ignoreParser: GitIgnoreParser): Promise<string[]> {
    const rootDir = resolve(repoPath, '..');
    const dirs = [rootDir];
    const files: string[] = [];

    while (dirs.length > 0) {
        const dir = dirs.pop();
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!ignoreParser.isIgnored(entry.name)) {
                    dirs.push(resolve(dir, entry.name));
                }
            } else if (entry.isFile()) {
                if (!ignoreParser.isIgnored(entry.name)) {
                    files.push(entry.name);
                }
            }
        }
    }
    return files;
}
