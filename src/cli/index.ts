// CLI Entry Point using Commander

import { Command } from 'commander'
import { runModelsCommand } from './models'
import { runCreditsCommand } from './credits'

const program = new Command()

program
  .name('kiro-proxy')
  .description('Kiro to Anthropic API Gateway')
  .version('1.0.0')

program
  .command('serve', { isDefault: true })
  .description('Start the API gateway server')
  .option('-p, --port <port>', 'Port to listen on')
  .action(async (options) => {
    // Dynamic import to avoid loading server code for other commands
    const { startServer } = await import('../server')
    startServer(options.port ? Number(options.port) : undefined)
  })

program
  .command('models')
  .description('List available Kiro models and mappings')
  .action(async () => {
    await runModelsCommand()
  })

program
  .command('credits')
  .description('Show Kiro credits usage and balance')
  .action(async () => {
    await runCreditsCommand()
  })

program
  .command('inspect')
  .description('Launch MITM proxy to capture Kiro API traffic')
  .option('-p, --port <port>', 'Proxy port', '8888')
  .option('-o, --output <dir>', 'Capture output directory', 'captures')
  .action(async (options) => {
    const { runInspectCommand } = await import('./inspect')
    await runInspectCommand(options)
  })

program.parse()
