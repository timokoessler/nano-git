import { stat } from 'node:fs/promises';
import path from 'node:path';

export async function findGitFolder(): Promise<string | undefined> {
    let currentPath = process.cwd();

    while (currentPath !== '/') {
        const gitFolderPath = path.join(currentPath, '.git');
        try {
            // eslint-disable-next-line no-await-in-loop -- Because we assume that we are already in the root directory
            const stats = await stat(gitFolderPath);
            if (stats.isDirectory()) {
                return gitFolderPath;
            }
        } catch {
            // Folder not found, continue searching in parent directory
        }

        currentPath = path.dirname(currentPath);
    }

    return undefined;
}
