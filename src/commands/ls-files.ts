import { error, log } from 'console';
import { exit } from 'process';
import { findGitFolder } from '../git/fs-helpers';
import GitRepo from '../git/git-repo';

export async function lsFilesCommand() {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }
    const repo = new GitRepo(folder);

    const index = await repo.getIndex();

    for (const entry of index.entries) {
        log(entry.name);
    }
}
