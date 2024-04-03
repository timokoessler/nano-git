import { readFile } from 'fs/promises';
import { readCompressedFile } from './compression.js';

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

export default class GitRepo {
    private path: string;

    constructor(path: string) {
        this.path = path;
    }

    async getBlob(sha: string) {
        const blobPath = `${this.path}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
        const buf = await readCompressedFile(blobPath);
        const headerEnd = buf.indexOf('\x00');
        if (headerEnd === -1) {
            throw new Error('Blob header is malformed');
        }
        const header = buf.subarray(0, headerEnd).toString();
        const content = buf.subarray(headerEnd + 1);
        return { header, content };
    }

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

    async getTree(sha: string) {
        const blob = await this.getBlob(sha);
        if (!blob.header.startsWith('tree')) {
            throw new Error('Object is not a tree');
        }
        const lines = blob.content.toString().split('\n');
        const entries = lines.map((line) => {
            const [mode, name, sha] = line.split(' ');
            return { mode, name, sha };
        });
        return entries;
    }

    /**
     * Get the sha1 hash of the commit that the branch points to
     * @param name Name of the branch e.g. main
     * @returns The sha1 hash of the commit that the branch points to
     */
    async getBranch(name: string) {
        const refPath = `${this.path}/refs/heads/${name}`;
        return (await readFile(refPath)).toString().trim();
    }

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
