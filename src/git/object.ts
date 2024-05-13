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

export interface GitObject {
    sha: string;
    header: string;
    content: Buffer;
    type: GitObjectType;
}

export interface Tree {
    sha: string;
    entries: { mode: number; name: string; sha: string }[];
}

/**
 * Get an object from a git repository
 * @param repoPath The path to the .git folder
 * @param sha The sha1 hash of the object
 * @returns The header, content and type of the object
 */
export async function getObject(repoPath: string, sha: string): Promise<GitObject> {
    const blobPath = `${repoPath}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
    if (await checkFileExists(blobPath)) {
        const buf = await readCompressedFile(blobPath);
        const headerEnd = buf.indexOf('\x00');
        if (headerEnd === -1) {
            throw new Error('Blob header is malformed');
        }
        const header = buf.subarray(0, headerEnd).toString();
        const content = buf.subarray(headerEnd + 1);
        return { sha, header, content, type: header.split(' ')[0] as GitObjectType };
    }
    const packObject = await getObjectFromAnyPack(repoPath, sha);
    if (!packObject) {
        throw new Error(`Object ${sha} not found`);
    }
    return {
        sha,
        header: `${packObject.type} ${packObject.size}\x00`,
        content: packObject.data,
        type: packObject.type as GitObjectType,
    };
}

/**
 * Parses a Commit / Tag line with user name, email and date
 * @param line
 * @returns Objekt with date, name and email
 */
function parseUserDateLine(line: string) {
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
}

/**
 * Parse a Git Object as a commit
 * @param commitObj Git Object to parse
 * @returns A commit object
 */
export function parseCommit(commitObj: GitObject): Commit {
    if (commitObj.type !== 'commit') {
        throw new Error('Object is not a commit');
    }
    const lines = commitObj.content.toString().split('\n');

    const tree = lines.find((line) => line.startsWith('tree'))?.split(' ')[1];
    if (tree === undefined) {
        throw new Error('Commit does not have a tree');
    }
    let parents = lines.filter((line) => line.startsWith('parent')).map((line) => line.split(' ')[1]);
    if (!Array.isArray(parents)) {
        parents = [];
    }

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

    return { sha: commitObj.sha, tree, parents, message, author, committer };
}

/**
 * Get a commit object from a git repository
 * @param repoPath The path to the .git folder
 * @param sha  Hash of the commit object
 * @returns A commit object
 */
export async function getCommit(repoPath: string, sha: string): Promise<Commit> {
    return parseCommit(await getObject(repoPath, sha));
}

/**
 * Parse a Git Object as a tree
 * @param treeObj Git Object to parse
 * @returns An array of objects with the mode, name and sha1 hash of the tree entries
 */
export function parseTree(treeObj: GitObject): Tree {
    if (treeObj.type !== 'tree') {
        throw new Error('Object is not a tree');
    }
    const entries: { mode: number; name: string; sha: string }[] = [];
    let offset = 0;
    while (offset < treeObj.content.length) {
        const spacePos = treeObj.content.indexOf(32, offset);
        const nullPos = treeObj.content.indexOf(0, spacePos);
        if (nullPos === -1) {
            throw new Error('Tree entry is malformed');
        }
        const mode = parseInt(treeObj.content.subarray(offset, spacePos).toString());
        const name = treeObj.content.subarray(spacePos + 1, nullPos).toString();
        const sha = treeObj.content.subarray(nullPos + 1, nullPos + 21).toString('hex');
        entries.push({ mode, name, sha });
        offset = nullPos + 21;
    }
    return { sha: treeObj.sha, entries };
}

/**
 * Get a tree object from a git repository
 * @param repoPath The path to the .git folder
 * @param sha The sha1 hash of the tree object
 * @returns An array of objects with the mode, name and sha1 hash of the tree entries
 */
export async function getTree(repoPath: string, sha: string) {
    return parseTree(await getObject(repoPath, sha));
}

/**
 * Parse a Git Object as a tag
 * @param tagObj Git Object to parse
 * @returns An object with the sha1 hash of the tagged object, the message and the tagger
 */
export function parseTag(tagObj: GitObject) {
    if (tagObj.type !== 'tag') {
        throw new Error('Object is not a tag');
    }
    const lines = tagObj.content.toString().split('\n');
    const object = lines.find((line) => line.startsWith('object'))?.split(' ')[1];
    if (object === undefined) {
        throw new Error('Tag does not have an object');
    }
    const type = lines.find((line) => line.startsWith('type'))?.split(' ')[1];
    if (type === undefined) {
        throw new Error('Tag does not have a type');
    }
    const tag = lines.find((line) => line.startsWith('tag'))?.split(' ')[1];
    if (tag === undefined) {
        throw new Error('Tag does not have a tag');
    }
    const taggerLine = lines.find((line) => line.startsWith('tagger'));
    if (taggerLine === undefined) {
        throw new Error('Tag does not have a tagger');
    }
    const messageStart = lines.findIndex((line) => line === '') + 1;
    const message = lines.slice(messageStart).join('\n');
    const tagger = parseUserDateLine(taggerLine);
    return { sha: tagObj.sha, object, type, tag, tagger, message };
}

/**
 * Get a tag object from a git repository
 * @param repoPath The path to the .git folder
 * @param sha The sha1 hash of the tag object
 * @returns An object with the sha1 hash of the tagged object, the message and the tagger
 */
export async function getTag(repoPath: string, sha: string) {
    return parseTag(await getObject(repoPath, sha));
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

/**
 * Replace Windows line endings with Unix line endings
 * @param content The content to modify
 */
function fixLineEndings(content: string) {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Preprocess an object before writing it to the object database or hashing it
 * @param content The content of the object
 * @param config The git configuration object
 * @param fileName A optional file name to use for binary detection
 * @param filters Whether to apply filters to the content (e.g. autocrlf)
 * @returns The processed content and its length
 */
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

/**
 * Write an object to the object database of a git repository
 * @param repoPath The path to the .git folder
 * @param type The type of the object
 * @param content The content of the object
 * @param config The git configuration object
 * @param fileName A optional file name to use for binary detection
 * @param filters Whether to apply filters to the content (e.g. autocrlf)
 * @returns The sha1 hash of the created object
 */
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

/**
 * Check if a string is a valid sha1 hash
 * @param hash The string to check
 * @returns True if the string is a valid sha1 hash, false otherwise
 */
export function isHash(hash: string) {
    return /^[0-9a-f]{40}$/.test(hash);
}
