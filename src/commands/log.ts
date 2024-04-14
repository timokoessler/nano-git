import { error, log } from 'console';
import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo from '../git/git-repo.js';
import { exit } from 'process';
import { Commit } from '../git/object.js';

function printCommit(commit: Commit) {
    log(`commit ${commit.sha}`);
    log(`Author: ${commit.author.name} <${commit.author.email}>`);
    log(`Committer: ${commit.committer.name} <${commit.committer.email}>`);
    log(`Date: ${commit.committer.date.toLocaleString()}`);
    log('');
    log(`    ${commit.message}`);
    log('');
}

export async function logCommand() {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }
    log(`Found git repository at ${folder}`);
    const repo = new GitRepo(folder);

    const head = await repo.getHead();

    const commits = [];
    commits.push(await repo.getCommit(head.commit));

    while (commits.length > 0) {
        const commit = commits.pop();
        if (commit === undefined) {
            break;
        }
        printCommit(commit);
        for (const parent of commit.parents) {
            commits.push(await repo.getCommit(parent));
        }
        if (commits.length > 0) {
            commits.sort((a, b) => a.author.date.getTime() - b.author.date.getTime());
        }
    }
}
