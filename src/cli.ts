import { program } from 'commander';
import { logCommand } from './commands/log';
import { statusCommand } from './commands/status';
import { catFileCommand } from './commands/cat-file';

program.name('ngit').version('0.1.0').description('A minimal Git implementation for educational purposes');

program.command('log').description('Show commit log').action(logCommand);
program.command('status').description('Show the status of the git repository').action(statusCommand);
program
    .command('cat-file')
    .description('Provide content or type and size information for repository objects')
    .argument('<hash>', 'The hash of the object')
    .option('-t, --type', 'Instead of the content, show the type of the object', false)
    .option('-s, --size', 'Instead of the content, show the size of the object', false)
    .option('-p, --pretty', 'Pretty-print the content', false)
    .action(catFileCommand);

program.parse();
