import { readFile } from 'fs/promises';
import { checkFileExists } from './fs-helpers';

export type GitConfig = Record<string, string> & {
    'core.autocrlf'?: 'true' | 'false' | 'input';
    'user.name'?: string;
    'user.email'?: string;
    'commit.gpgsign'?: 'true' | 'false';
    'init.defaultBranch'?: string;
};

/**
 * Parse a git config file
 * @param path Path to the git config file
 * @returns An object with the config values
 */
async function parseGitConfig(path: string) {
    if (!(await checkFileExists(path))) {
        return {};
    }
    const content = await readFile(path, 'utf8');
    const lines = content.split('\n');
    const config: GitConfig = {};
    let currentSection = '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') {
            continue;
        }
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSection = trimmed.slice(1, -1);
            continue;
        }
        const [key, value] = line.split('=');

        // Prevent prototype pollution
        if (key.includes('__proto__') || key.includes('constructor') || key.includes('prototype')) {
            throw new Error('Abort parsing git config: key contains forbidden sequence "__proto__" or "constructor" or "prototype"');
        }
        config[`${currentSection}.${key.trim()}`] = value.trim();
    }
    return config;
}

/**
 * Parse the global (per-user) git config
 * @returns An object with the global git config values
 */
export async function parseGlobalGitConfig() {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home === undefined) {
        throw new Error('Error parsing global git config: HOME or USERPROFILE environment variable is not set');
    }
    return await parseGitConfig(`${home}/.gitconfig`);
}

/**
 * Merge global and local git configs (local overrides global)
 * @param globalConfig
 * @param localConfig
 * @returns A new object with the merged configs
 */
function mergeGitConfigs(globalConfig: GitConfig, localConfig: GitConfig) {
    // Local config overrides global config
    return Object.assign({}, globalConfig, localConfig);
}

export async function readMergedGitConfig(repoPath: string) {
    return mergeGitConfigs(await parseGlobalGitConfig(), await parseGitConfig(`${repoPath}/config`));
}
