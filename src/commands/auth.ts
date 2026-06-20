import { parseCommand } from '../lib/args.js';
import { authStatus, clearTokens, login } from '../lib/auth.js';
import { tokenFilePath } from '../lib/config.js';
import { AppError, ExitCode } from '../lib/output.js';
import { output } from './_shared.js';

const HELP = `strava auth — manage authentication

Usage:
  strava auth login     Authorize via the browser and store tokens (one time)
  strava auth status    Show whether the CLI is authenticated
  strava auth logout    Delete stored tokens

Setup:
  Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET (see .env.example), and set your
  Strava app's "Authorization Callback Domain" to "localhost".
`;

export async function run(args: string[]): Promise<number> {
  const { positionals, global, helpRequested } = parseCommand(args);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const sub = positionals[0];
  switch (sub) {
    case 'login': {
      const result = await login();
      output({ authenticated: true, scope: result.scope, expires_at: result.expires_at }, global);
      return ExitCode.Ok;
    }
    case 'status':
      output(authStatus(), global);
      return ExitCode.Ok;
    case 'logout': {
      const removed = clearTokens();
      output({ logged_out: removed, token_file: tokenFilePath() }, global);
      return ExitCode.Ok;
    }
    default:
      throw new AppError('usage', sub ? `Unknown auth subcommand "${sub}".` : 'Missing auth subcommand.', {
        hint: 'Use login, status, or logout.',
      });
  }
}
