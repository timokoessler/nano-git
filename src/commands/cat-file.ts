import { error, log } from 'console';
import GitRepo from '../git/git-repo';
import { findGitFolder } from '../git/fs-helpers';
import { exit } from 'process';

export async function catFileCommand(hash: string, options: { type: boolean; size: boolean; pretty: boolean }) {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }

    // Error if multiple options are passed at the same time or no option is passed
    if (
        (options.type && options.size) ||
        (options.type && options.pretty) ||
        (options.size && options.pretty) ||
        (!options.type && !options.size && !options.pretty)
    ) {
        error('You must specify exactly one of --type, --size, or --pretty');
        exit(1);
    }

    const repo = new GitRepo(folder);

    const object = await repo.getObject(hash);
    if (options.type) {
        log(object.type);
    } else if (options.size) {
        log(object.header.split(' ')[1]);
    } else if (options.pretty) {
        if (object.type === 'tree') {
            const tree = await repo.getTree(hash);
            tree.forEach((entry) => {
                log(`${entry.mode.toString().padStart(6, '0')} ${entry.sha} ${entry.name}`);
            });
            return;
        }
        log(object.content.toString());
    }
}
