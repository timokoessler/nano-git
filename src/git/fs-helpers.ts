import { access, constants, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Find the .git folder in the current directory or any of its parent directories
 * @returns A promise that resolves to the path of the .git folder or undefined if it was not found
 */
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

/**
 * Check if a directory exists at the given path
 * @param path The path to the directory
 * @returns A promise that resolves to true if the directory exists, false otherwise
 */
export async function checkDirectoryExists(path: string) {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}
