import { readFile } from 'fs/promises';
import { readCompressedFile } from './compression.js';
import { checkFileExists } from './fs-helpers.js';
import { findObjectInPackIndex, getObjectFromPack } from './pack.js';

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
 * Class to interact with a git repository
 */
export default class GitRepo {
    private path: string;

    constructor(path: string) {
        this.path = path;
    }

    /**
     * Get the contents of a blob object
     * @param sha The sha1 hash of the blob object
     * @returns An object with the header and content of the blob
     */
    async getBlob(sha: string) {
        const blobPath = `${this.path}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
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
        // Todo: Check if it's a packed object
        throw new Error(`No object found with sha ${sha}, Packfiles are not supported yet`);
    }

    /**
     * Get a commit object from the repository
     * @param sha The sha1 hash of the commit object
     * @returns The commit object
     */
    async getCommit(sha: string): Promise<Commit> {
        const blob = await this.getBlob(sha);
        if (!blob.header.startsWith('commit')) {
            throw new Error('Object is not a commit');
        }
        const lines = blob.content.toString().split('\n');

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

    /**
     * Get the entries of a tree object
     * @param sha The sha1 hash of the tree object
     * @returns An array of objects with the mode, name and sha1 hash of the tree entries
     */
    async getTree(sha: string) {
        const blob = await this.getBlob(sha);
        if (!blob.header.startsWith('tree')) {
            throw new Error('Object is not a tree');
        }
        const lines = blob.content.toString().split('\n');
        const entries = lines.map((line) => {
            const [mode, type, name, sha] = line.split(' ');
            return { mode, type, name, sha };
        });
        return entries;
    }

    /**
     * Read packfile index
     * https://git-scm.com/docs/pack-format
     * @param packSha The sha1 hash of the packfile
     * @param sha The sha1 hash of the object to find
     */
    async getObjectFromPack(packSha: string, sha: string) {
        const indexInfo = await findObjectInPackIndex(this.path, packSha, sha);
        if (indexInfo === null) {
            throw new Error(`Object ${sha} not found in pack ${packSha}`);
        }
        const object = await getObjectFromPack(this.path, packSha, indexInfo);
        // Todo
    }

    /**
     * Get a reference (e.g. branch or tag) from the repository
     * @param ref The type and name of the reference e.g. heads/main, tags/v1.0.0
     * @returns The sha1 hash of the reference
     */
    async getRef(ref: string) {
        const refPath = `${this.path}/refs/${ref}`;
        // Check if file exists
        if (await checkFileExists(refPath)) {
            return (await readFile(refPath)).toString().trim();
        }
        // Check if it's a packed ref
        const packedRefs = (await readFile(`${this.path}/packed-refs`)).toString();
        const line = packedRefs.split('\n').find((line) => line.endsWith(`refs/${ref}`));
        if (line !== undefined) {
            return line.split(' ')[0];
        }
        throw new Error(`Ref ${ref} not found`);
    }

    /**
     * Get the sha1 hash of the commit that the branch points to
     * A convenience method that calls getRef with the correct prefix
     * @param name Name of the branch e.g. main
     * @returns The sha1 hash of the commit that the branch points to
     */
    async getBranch(name: string) {
        return this.getRef(`heads/${name}`);
    }

    // Todo: Support more types of references and detached HEAD
    async getHead() {
        const content = (await readFile(`${this.path}/HEAD`)).toString().trim();
        if (content.startsWith('ref: refs/heads/')) {
            return {
                type: 'branch',
                name: content.slice(16),
                commit: await this.getBranch(content.slice(16)),
            };
        }
        throw new Error('HEAD is not a branch (currently not supported)');
    }

    getPath() {
        return this.path;
    }
}
