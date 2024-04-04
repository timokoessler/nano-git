import { access, constants, stat } from 'node:fs/promises';
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

/**
 * Check if a file exists at the given path
 * @param path The path to the file
 * @returns A promise that resolves to true if the file exists, false otherwise
 */
export async function checkFileExists(path: string) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}
