import { parseCommand, type OptionMap } from '../lib/args.js';
import { authStatus, clearTokens, login, setup } from '../lib/auth.js';
import { tokenFilePath } from '../lib/config.js';
import { AppError, ExitCode } from '../lib/output.js';
import { output } from './_shared.js';

const OPTIONS: OptionMap = {
  'no-login': { type: 'boolean' },
  'client-id': { type: 'string' },
  'client-secret': { type: 'string' },
};

const HELP = `strava auth — manage authentication

Usage:
  strava auth setup     Configure your Strava app + log in (interactive, recommended)
  strava auth login     Authorize via the browser and store tokens
  strava auth status    Show the configured app and whether you're authenticated
  strava auth logout    Delete stored tokens

Options (setup):
  --client-id <id>       Provide the Client ID non-interactively
  --client-secret <s>    Provide the Client Secret non-interactively
  --no-login             Save credentials but skip the browser login

Bring-your-own app:
  Registering the Strava API app is a one-time, web-only step at
  https://www.strava.com/settings/api (set the callback domain to "localhost").
  Then point the CLI at it, either interactively:
      strava auth setup
  or non-interactively:
      strava auth setup --client-id 12345 --client-secret <secret>
  (Environment variables STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET also work and
  take precedence over the stored values.)
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
      const result = await setup({
        clientId: typeof values['client-id'] === 'string' ? values['client-id'] : undefined,
        clientSecret:
          typeof values['client-secret'] === 'string' ? values['client-secret'] : undefined,
        runLogin: !values['no-login'],
      });
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
