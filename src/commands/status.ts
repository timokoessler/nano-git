import { error, log } from 'console';
import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo from '../git/git-repo.js';
import { exit } from 'process';
import chalk from 'chalk';

export async function statusCommand() {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }
    const repo = new GitRepo(folder);

    const head = await repo.getHead();

    log(`On ${head.type} ${head.name}`);

    const index = await repo.getIndex();
    const lastCommit = await repo.getCommit(head.commit);
    const rootTree = await repo.getTree(lastCommit.tree);
    const changes = await repo.getWorkingDirStatus(index, rootTree);

    // Todo print:
    // - Is up to date with remote

    if (changes.length === 0) {
        log('nothing to commit, working tree clean');
        return;
    }

    const stagedChanges = changes.filter((change) => change.status === 'staged');
    if (stagedChanges.length > 0) {
        log('\nChanges to be committed:');
        for (const change of stagedChanges) {
            log(chalk.green(`    ${change.stagingStatus}:  ${change.name}`));
        }
    }

    const modifiedFiles = changes.filter((change) => change.status === 'modified');
    if (modifiedFiles.length > 0) {
        log('\nChanges not staged for commit:');
        for (const file of modifiedFiles) {
            log(chalk.red(`    modified:  ${file.name}`));
        }
    }

    const untrackedFiles = changes.filter((change) => change.status === 'untracked');
    if (untrackedFiles.length > 0) {
        log('\nUntracked files:');
        for (const file of untrackedFiles) {
            log(chalk.red(`    ${file.name}`));
        }
    }
}
