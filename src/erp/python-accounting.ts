import { spawn } from 'node:child_process';
import { join } from 'node:path';

export interface TaxCalculation {
  base_minor: number;
  rate_bps: number;
  tax_minor: number;
  total_minor: number;
  rounding: 'half_up_once_to_integer_minor_unit';
  cash_rounding?: { rounded_total_minor: number; difference_minor: number };
}

export interface CashRoundingRule {
  increment_minor: number;
  method: 'UP' | 'DOWN' | 'HALF-UP';
}

/** Run the bounded, dependency-free Python tax arithmetic adapter. */
export function calculateTaxWithPython(
  baseMinor: number,
  rateBps: number,
  rule?: CashRoundingRule,
): Promise<TaxCalculation> {
  const python =
    process.env.AFRICORE_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  const script = join(__dirname, '..', '..', 'python', 'africore_accounting', 'tax.py');
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '',
      stderr = '',
      settled = false;
    const finish = (error?: Error, result?: TaxCalculation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Python accounting calculation timed out'));
    }, 5000);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 2048) {
        child.kill();
        finish(new Error('Python accounting response exceeded its limit'));
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 2048) child.kill();
    });
    child.once('error', (error) =>
      finish(new Error('Python accounting runtime unavailable: ' + error.message)),
    );
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0)
        return finish(new Error('Python accounting calculation failed: ' + stderr.slice(0, 500)));
      try {
        const value = JSON.parse(stdout) as TaxCalculation;
        if (
          value.base_minor !== baseMinor ||
          value.rate_bps !== rateBps ||
          !Number.isSafeInteger(value.tax_minor) ||
          value.tax_minor < 0 ||
          value.tax_minor > baseMinor ||
          !Number.isSafeInteger(value.total_minor) ||
          value.total_minor !== baseMinor + value.tax_minor ||
          value.rounding !== 'half_up_once_to_integer_minor_unit'
        )
          throw new Error('Python accounting response failed validation');
        const cash = value.cash_rounding;
        if (
          rule
            ? !cash ||
              !Number.isSafeInteger(cash.rounded_total_minor) ||
              cash.rounded_total_minor < 0 ||
              cash.rounded_total_minor % rule.increment_minor !== 0 ||
              cash.difference_minor !== cash.rounded_total_minor - value.total_minor ||
              Math.abs(cash.difference_minor) >= rule.increment_minor
            : cash !== undefined
        )
          throw new Error('Python cash rounding response failed validation');
        finish(undefined, value);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Invalid Python accounting response'));
      }
    });
    child.stdin.once('error', () => finish(new Error('Python accounting input could not be sent')));
    child.stdin.end(
      JSON.stringify({ base_minor: baseMinor, rate_bps: rateBps, cash_rounding: rule }),
    );
  });
}
