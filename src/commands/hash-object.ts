import { error, log } from 'console';
import { exit } from 'process';
import { GitObjectType, gitObjectTypes, hashObject } from '../git/object';
import { readFile } from 'fs/promises';

export async function hashObjectCommand(path: string, options: { type: string; filters: boolean }) {
    let type = 'blob';
    if (options.type) {
        type = options.type;
    }

    if (!gitObjectTypes.includes(type)) {
        error(`Invalid object type. Must be one of ${gitObjectTypes.join(', ')}`);
        exit(1);
    }

    const content = await readFile(path);
    const fileName = path.split('/').pop();
    log(hashObject(type as GitObjectType, content, fileName, options.filters));
}
