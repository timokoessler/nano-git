import { error, log } from 'console';
import { findGitFolder } from '../git/fs-helpers.js';
import GitRepo from '../git/git-repo.js';
import { exit } from 'process';

export async function checkIgnoreCommand(path: string) {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }
    const repo = new GitRepo(folder);
    const ignore = await repo.getGitIgnoreParser();

    if (ignore.isIgnored(path)) {
        log('Ignored');
        exit(0);
    } else {
        log('Not ignored');
        exit(1);
    }
}
