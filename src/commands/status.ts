import { error, log } from 'console';
import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo from '../git/git-repo.js';

export async function statusCommand() {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository', { exit: 1 });
    }
    const repo = new GitRepo(folder);

    const head = await repo.getHead();

    log(`On ${head.type} ${head.name}`);

    // Todo print:
    // - Is up to date with remote
    // - Changes to be committed
    // - Changes not staged for commit
    // - Untracked files
}
