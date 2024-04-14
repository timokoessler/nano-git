import { program } from 'commander';
import { logCommand } from './commands/log';
import { statusCommand } from './commands/status';
import { catFileCommand } from './commands/cat-file';
import { hashObjectCommand } from './commands/hash-object';

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

program
    .command('hash-object')
    .description('Compute object ID from a file')
    .argument('<file>', 'The path to the file to hash')
    .option('-t, --type <type>', 'Specify the type', 'blob')
    .option('--no-filters', 'Do not normalize line endings (default)')
    .option('-w, --write', 'Actually write the object into the database')
    .action(hashObjectCommand);

program.parse();
