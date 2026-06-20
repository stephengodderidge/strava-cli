import { parseCommand, type OptionMap } from '../lib/args.js';
import { authStatus, clearTokens, login, setup } from '../lib/auth.js';
import { tokenFilePath } from '../lib/config.js';
import { AppError, ExitCode } from '../lib/output.js';
import { output } from './_shared.js';

const OPTIONS: OptionMap = {
  'no-login': { type: 'boolean' },
};

const HELP = `strava auth — manage authentication

Usage:
  strava auth setup     Enter Client ID/Secret and log in (interactive, recommended)
  strava auth login     Authorize via the browser and store tokens
  strava auth status    Show whether the CLI is authenticated
  strava auth logout    Delete stored tokens

Options:
  --no-login            (with setup) save credentials but skip the browser login

Setup:
  Creating the Strava API app is a one-time, web-only step at
  https://www.strava.com/settings/api (set the callback domain to "localhost").
  \`strava auth setup\` opens that page, then stores the Client ID/Secret for you.
  Alternatively, set STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET (see .env.example).
`;

export async function run(args: string[]): Promise<number> {
  const { values, positionals, global, helpRequested } = parseCommand(args, OPTIONS);
  if (helpRequested) {
    process.stdout.write(HELP);
    return ExitCode.Ok;
  }

  const sub = positionals[0];
  switch (sub) {
    case 'setup': {
      const result = await setup({ runLogin: !values['no-login'] });
      output(result, global);
      return ExitCode.Ok;
    }
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
        hint: 'Use setup, login, status, or logout.',
      });
  }
}
