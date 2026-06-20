/** Test helpers: capture stdout/stderr written during a (possibly async) call. */

export interface Captured {
  stdout: string;
  stderr: string;
  result: unknown;
}

export async function capture(fn: () => unknown | Promise<unknown>): Promise<Captured> {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  (process.stdout as { write: unknown }).write = (chunk: unknown) => {
    stdout += String(chunk);
    return true;
  };
  (process.stderr as { write: unknown }).write = (chunk: unknown) => {
    stderr += String(chunk);
    return true;
  };
  try {
    const result = await fn();
    return { stdout, stderr, result };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}
