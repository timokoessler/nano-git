import { program } from 'commander';
import { logCommand } from './commands/log';
import { statusCommand } from './commands/status';

program.name('ngit').version('0.1.0').description('A minimal Git implementation for educational purposes');

program.command('log').description('Show commit log').action(logCommand);
program.command('status').description('Show the status of the git repository').action(statusCommand);

program.parse();
