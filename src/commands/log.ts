import { Command } from '@oclif/core';

import { findGitFolder } from '../git/fs-helpers.js';

export default class Log extends Command {
    static args = {};
    static description = 'Show commit log';
    static examples = ['$ ngit log'];
    static flags = {};

    async run(): Promise<void> {
        this.log(await findGitFolder());
    }
}
