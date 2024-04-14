import { createHash } from 'crypto';
import { readCompressedFile, writeCompressedFile } from './compression.js';
import { checkDirectoryExists, checkFileExists } from './fs-helpers.js';
import { getObjectFromAnyPack } from './pack.js';
import { isBinary } from 'istextorbinary';
import { GitConfig } from './git-config.js';
import { mkdir } from 'fs/promises';

export type GitObjectType = 'commit' | 'tree' | 'blob' | 'tag';
export const gitObjectTypes = ['commit', 'tree', 'blob', 'tag'];

export interface Commit {
    sha: string;
    tree: string;
    parents: string[];
    message: string;
    author: {
        date: Date;
        name: string;
        email: string;
    };
    committer: {
        date: Date;
        name: string;
        email: string;
    };
}

/**
 * Get an object from a git repository
 * @param repoPath The path to the .git folder
 * @param sha The sha1 hash of the object
 * @returns The header, content and type of the object
 */
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
        return { header, content, type: header.split(' ')[0] };
    }
    const packObject = await getObjectFromAnyPack(repoPath, sha);
    if (packObject === null) {
        throw new Error(`Object ${sha} not found`);
    }
    return {
        header: `${packObject.type} ${packObject.size}\x00`,
        content: packObject.data,
        type: packObject.type,
    };
}

export async function getCommit(repoPath: string, sha: string): Promise<Commit> {
    const obj = await getObject(repoPath, sha);
    if (obj.type !== 'commit') {
        throw new Error('Object is not a commit');
    }
    const lines = obj.content.toString().split('\n');

    const tree = lines.find((line) => line.startsWith('tree'))?.split(' ')[1];
    if (tree === undefined) {
        throw new Error('Commit does not have a tree');
    }
    let parents = lines.filter((line) => line.startsWith('parent')).map((line) => line.split(' ')[1]);
    if (!Array.isArray(parents)) {
        parents = [];
    }

    const parseUserDateLine = (line: string) => {
        const parts = line.split(' ');
        const user = parts.slice(1, -2);
        const email = user.pop()?.slice(1, -1);
        if (email === undefined) {
            throw new Error('Commit does not have an email');
        }
        const name = user.join(' ');

        const timestamp = parseInt(parts[parts.length - 2]);
        const date = new Date(timestamp * 1000);

        return { date, name, email };
    };

    const authorLine = lines.find((line) => line.startsWith('author'));
    if (authorLine === undefined) {
        throw new Error('Commit does not have an author');
    }

    const committerLine = lines.find((line) => line.startsWith('committer'));
    if (committerLine === undefined) {
        throw new Error('Commit does not have a committer');
    }

    const author = parseUserDateLine(authorLine);
    const committer = parseUserDateLine(committerLine);
    const messageStart = lines.findIndex((line) => line === '') + 1;
    const message = lines.slice(messageStart).join('\n');

    return { sha, tree, parents, message, author, committer };
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

/**
 * Get the sha1 hash of an file
 * @param type The type of the object
 * @param content The content of the object as a buffer
 * @returns The sha1 hash of the object
 */
export function hashObject(type: GitObjectType, content: Buffer, config: GitConfig, fileName = '', filters = true) {
    const { content: hashContent, length } = preProcessObject(content, config, fileName, filters);
    return createHash('sha1').update(`${type} ${length}\x00`).update(hashContent).digest('hex');
}

function fixLineEndings(content: string) {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function preProcessObject(content: Buffer, config: GitConfig, fileName = '', filters = true) {
    if ((filters && !isBinary(fileName, content) && config['core.autocrlf'] === 'true') || config['core.autocrlf'] === 'input') {
        const hashContent = fixLineEndings(content.toString('utf8'));
        return {
            content: hashContent,
            length: Buffer.byteLength(hashContent),
        };
    }
    return {
        content,
        length: content.length,
    };
}

export async function writeObject(
    repoPath: string,
    type: GitObjectType,
    content: Buffer,
    config: GitConfig,
    fileName = '',
    filters = false,
) {
    const { content: hashContent, length } = preProcessObject(content, config, fileName, filters);
    const sha = createHash('sha1').update(`${type} ${length}\x00`).update(hashContent).digest('hex');
    const objectDir = `${repoPath}/objects/${sha.slice(0, 2)}`;
    const objectPath = `${objectDir}/${sha.slice(2)}`;

    if (!checkDirectoryExists(objectPath)) {
        await mkdir(objectDir, { recursive: true });
    }

    await writeCompressedFile(objectPath, Buffer.from(`${type} ${length}\x00${hashContent}`));
    return sha;
}
