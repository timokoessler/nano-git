import { error, log } from 'console';
import GitRepo from '../git/git-repo';
import { findGitFolder } from '../git/fs-helpers';
import { exit } from 'process';
import { Tree, parseTree } from '../git/object';

async function listTree(repo: GitRepo, tree: Tree, recursive: boolean, path: string = '') {
    for (const entry of tree.entries) {
        log(`${entry.mode.toString().padStart(6, '0')} ${entry.sha} ${path}${entry.name}`);
        if (recursive && entry.mode === 40000) {
            await listTree(repo, await repo.getTree(entry.sha), recursive, `${path}${entry.name}/`);
        }
    }
}

export async function lsTreeCommand(hash: string, options: { recursive: boolean }) {
    const folder = await findGitFolder();
    if (folder === undefined) {
        error('Not a git repository');
        exit(1);
    }

    const repo = new GitRepo(folder);

    const object = await repo.getObject(hash);

    if (object.type !== 'tree') {
        error('Object is not a tree');
        exit(1);
    }

    const tree = parseTree(object);
    await listTree(repo, tree, options.recursive);
}
