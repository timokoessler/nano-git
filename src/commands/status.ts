import { error, log } from 'console';
import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo from '../git/git-repo.js';
import { exit } from 'process';

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

    const stagedChanges = changes.filter((change) => change.status === 'staged');
    if (stagedChanges.length > 0) {
        log('\nChanges to be committed:');
        for (const change of stagedChanges) {
            log(`  ${change.stagingStatus}:  ${change.name}`);
        }
    }

    // Todo print:
    // - Is up to date with remote
    // - Changes to be committed
    // - Changes not staged for commit
    // - Untracked files
}
