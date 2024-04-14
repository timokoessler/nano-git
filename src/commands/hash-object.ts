import { error, log } from 'console';
import { exit } from 'process';
import { GitObjectType, gitObjectTypes } from '../git/object';
import { readFile } from 'fs/promises';
import { findGitFolder } from '../git/fs-helpers';
import GitRepo from '../git/git-repo';

export async function hashObjectCommand(path: string, options: { type: string; filters: boolean; write: boolean }) {
    let type = 'blob';
    if (options.type) {
        type = options.type;
    }

    if (!gitObjectTypes.includes(type)) {
        error(`Invalid object type. Must be one of ${gitObjectTypes.join(', ')}`);
        exit(1);
    }

    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }
    const repo = new GitRepo(folder);

    const content = await readFile(path);
    const fileName = path.split('/').pop();

    if (!options.write) {
        log(await repo.hashObject(type as GitObjectType, content, fileName, options.filters));
    } else {
        log(await repo.writeObject(type as GitObjectType, content, fileName, options.filters));
    }
}
