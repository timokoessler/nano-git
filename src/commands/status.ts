import { Command } from '@oclif/core';
import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo from '../git/git-repo.js';
import { readFile } from 'fs/promises';

export default class Status extends Command {
    static args = {};
    static description = 'Shows the status of the git repository';
    static examples = ['$ ngit status'];
    static flags = {};

    async run(): Promise<void> {
        const folder = await findGitFolder();
        if (folder === undefined) {
            this.error('Not a git repository', { exit: 1 });
        }
        const repo = new GitRepo(folder);

        const head = await repo.getHead();

        this.log(`On ${head.type} ${head.name}`);

        // Todo print:
        // - Is up to date with remote
        // - Changes to be committed
        // - Changes not staged for commit
        // - Untracked files
    }
}
