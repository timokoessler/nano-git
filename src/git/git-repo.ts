import { readFile } from 'fs/promises';
import { checkFileExists } from './fs-helpers.js';
import { GitObjectType, getCommit, getObject, hashObject, writeObject } from './object.js';
import { parseIndexFile } from './staging.js';
import { GitConfig, readMergedGitConfig } from './git-config.js';
import { GitIgnoreParser } from './git-ignore.js';

/**
 * Class to interact with a git repository
 */
export default class GitRepo {
    private path: string;
    private config: GitConfig;
    private gitignore: GitIgnoreParser;

    constructor(path: string) {
        this.path = path;
    }

    /**
     * Get the config of the repository
     * @returns The config of the repository
     */
    async getConfig() {
        if (this.config === undefined) {
            this.config = await readMergedGitConfig(this.path);
        }
        return this.config;
    }

    /**
     * Get the contents of a object
     * @param sha The sha1 hash of the object
     * @returns An object with the header, content and type of the object
     */
    async getObject(sha: string) {
        return await getObject(this.path, sha);
    }

    /**
     * Get a commit object from the repository
     * @param sha The sha1 hash of the commit object
     * @returns The commit object
     */
    async getCommit(sha: string) {
        return await getCommit(this.path, sha);
    }

    /**
     * Get the entries of a tree object
     * @param sha The sha1 hash of the tree object
     * @returns An array of objects with the mode, name and sha1 hash of the tree entries
     */
    async getTree(sha: string) {
        const obj = await getObject(this.path, sha);
        if (obj.type !== 'tree') {
            throw new Error('Object is not a tree');
        }
        const lines = obj.content.toString().split('\n');
        const entries = lines.map((line) => {
            const [mode, type, name, sha] = line.split(' ');
            return { mode, type, name, sha };
        });
        return entries;
    }

    /**
     * Get the index of the repository
     * @returns Todo: Add return type
     */
    async getIndex() {
        return await parseIndexFile(this.path);
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
        if (content.startsWith('ref: refs/tags/')) {
            return {
                type: 'tag',
                name: content.slice(15),
                commit: await this.getRef(content.slice(5)),
            };
        }
        throw new Error('HEAD does not point to a branch or tag. This is not supported yet');
    }

    /**
     * Get the path of the repository
     * @returns The path of the .git folder
     */
    getPath() {
        return this.path;
    }

    /**
     * Hash an object and write it to the object store
     * @param type The type of the object (commit, tree, blob, tag)
     * @param content The data of the object
     * @param fileName The name of the file (optional)
     * @param filters Run filters on the content (default: true)
     * @returns The sha1 hash of the object
     */
    async hashObject(type: GitObjectType, content: Buffer, fileName = '', filters = true) {
        return hashObject(type, content, await this.getConfig(), fileName, filters);
    }

    /**
     * Write an object to the object store
     * @param type The type of the object (commit, tree, blob, tag)
     * @param content The data of the object
     * @param fileName The name of the file (optional)
     * @param filters Run filters on the content (default: true)
     * @returns The sha1 hash of the object
     */
    async writeObject(type: GitObjectType, content: Buffer, fileName = '', filters = true) {
        return await writeObject(this.path, type, content, await this.getConfig(), fileName, filters);
    }

    /**
     * Get the gitignore parser
     * If the parser has not been initialized yet, it will be initialized
     * @returns A instance of the GitIgnoreParser
     */
    async getGitIgnoreParser() {
        if (this.gitignore === undefined) {
            const config = await this.getConfig();
            this.gitignore = new GitIgnoreParser(this.path, config['core.ignorecase'] === 'true');
            await this.gitignore.init();
        }
        return this.gitignore;
    }
}
