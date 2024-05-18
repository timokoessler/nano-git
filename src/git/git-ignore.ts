// https://git-scm.com/docs/gitignore
import { readFile, readdir } from 'fs/promises';
import ignore, { Ignore } from 'ignore';
import { relative, resolve } from 'path';

export class GitIgnoreParser {
    private repoRoot: string;
    private ignore: Ignore;

    constructor(repoPath: string, ignoreCase: boolean = false) {
        this.repoRoot = resolve(repoPath, '..');
        this.ignore = ignore({ ignoreCase });
        this.ignore.add('.git');
    }

    /**
     * Initialize the parser by reading all gitignore files in the repository
     * .gitignore files that are in ignored directories are not read
     * @returns An array of paths to all gitignore files that were read
     */
    async init() {
        // Get all gitignore files in the repository
        const dirs = [this.repoRoot];
        const ignoreFiles: string[] = [];

        while (dirs.length > 0) {
            const dir = dirs.pop();
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (!this.ignore.ignores(entry.name)) {
                        dirs.push(resolve(dir, entry.name));
                    }
                } else if (entry.isFile() && entry.name === '.gitignore') {
                    const content = await readFile(resolve(dir, entry.name), 'utf8');
                    const relativePath = relative(this.repoRoot, dir);
                    this.ignore.add(content.split(/\r?\n/).map((line) => `${relativePath}/${line}`));
                }
            }
        }
        return ignoreFiles;
    }

    /**
     * Check if a path is ignored by the gitignore rules
     * @param path The path to check
     * @returns True if the path is ignored, false otherwise
     */
    isIgnored(path: string) {
        return this.ignore.ignores(relative(this.repoRoot, path));
    }
}
