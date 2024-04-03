import { Command } from '@oclif/core';

import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo, { Commit } from '../git/git-repo.js';

export default class Log extends Command {
    static args = {};
    static description = 'Show commit log';
    static examples = ['$ ngit log'];
    static flags = {};

    private async printCommit(commit: Commit) {
        this.log(`commit ${commit.sha}`);
        this.log(`Author: ${commit.author.name} <${commit.author.email}>`);
        this.log(`Committer: ${commit.committer.name} <${commit.committer.email}>`);
        this.log(`Date: ${commit.committer.date.toLocaleString()}`);
        this.log('');
        this.log(`    ${commit.message}`);
        this.log('');
    }

    async run(): Promise<void> {
        const folder = await findGitFolder();
        if (folder === undefined) {
            this.error('Not a git repository', { exit: 1 });
        }
        this.log(`Found git repository at ${folder}`);
        const repo = new GitRepo(folder);

        const head = await repo.getHead();
        if (head.type !== 'branch') {
            this.error('HEAD does not point to a branch. This is not supported yet.', { exit: 1 });
        }

        const commits = [];
        commits.push(await repo.getCommit(head.commit));

        while (commits.length > 0) {
            const commit = commits.pop();
            if (commit === undefined) {
                break;
            }
            await this.printCommit(commit);
            for (const parent of commit.parents) {
                commits.push(await repo.getCommit(parent));
            }
            if (commits.length > 0) {
                commits.sort((a, b) => a.author.date.getTime() - b.author.date.getTime());
            }
        }
    }
}
