import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fail } from '../platform/auth';

/**
 * Invokes the AfriCore Python Autonomous Agent engine (`engines/agent/runtime.py`)
 * using isolated mode (`-I`) over JSON stdin/stdout.
 */
export async function runPythonAgent<T = any>(payload: Record<string, unknown>): Promise<T> {
  const executable =
    process.env.AFRICORE_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const scriptPath = join(__dirname, '..', '..', 'engines', 'agent', 'runtime.py');
  const serialized = JSON.stringify(payload);

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      executable,
      ['-I', scriptPath],
      { timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (error, out, err) => {
        if (error) {
          reject(
            new Error(
              'Python autonomous agent runtime unavailable: ' +
                (err?.slice(0, 300) || error.message),
            ),
          );
        } else {
          resolve(out);
        }
      },
    );
    child.stdin?.once('error', () =>
      reject(new Error('Python autonomous agent input could not be sent')),
    );
    child.stdin?.end(serialized);
  });

  const parsed = JSON.parse(stdout);
  if (typeof parsed?.error === 'string' && parsed.error.length <= 300) {
    fail(400, parsed.error);
  }
  return parsed as T;
}
