import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { fail } from '../platform/auth';

export async function bankPython<T>(input: object, schema: z.ZodType<T>): Promise<T> {
  return accountingPython('bank', input, schema);
}

const pythonCache = new Map<string, string>();
const MAX_PYTHON_CACHE = 400;

export async function accountingPython<T>(
  script:
    | 'bank'
    | 'assets'
    | 'deferrals'
    | 'opening'
    | 'statements'
    | 'inventory_valuation'
    | 'sales_pricing'
    | 'procurement_matching'
    | 'pos_session'
    | 'crm_forecast'
    | 'work_billing'
    | 'payroll'
    | 'subscriptions'
    | 'mrp_costing'
    | 'sales_promotions_commissions'
    | 'financial_statements_treasury'
    | 'crm_routing_analytics'
    | 'warehouse_replenishment_waves'
    | 'purchasing_pos_operations'
    | 'enterprise_operations'
    | 'rbac_service_pricing',
  input: object,
  schema: z.ZodType<T>,
): Promise<T> {
  const serializedInput = JSON.stringify(input);
  const cacheKey = script + '\0' + serializedInput;
  let output = pythonCache.get(cacheKey);
  if (output === undefined) {
    const executable =
      process.env.AFRICORE_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    const path = join(__dirname, '..', '..', 'engines', 'domain', script + '.py');
    output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        executable,
        ['-I', path],
        { timeout: 8000, maxBuffer: 512 * 1024, windowsHide: true },
        (error, stdout) => {
          if (error) reject(new Error('Python accounting calculation unavailable'));
          else resolve(stdout);
        },
      );
      child.stdin?.once('error', () =>
        reject(new Error('Python accounting input could not be sent')),
      );
      child.stdin?.end(serializedInput);
    });
    pythonCache.set(cacheKey, output);
    if (pythonCache.size > MAX_PYTHON_CACHE) {
      pythonCache.delete(pythonCache.keys().next().value!);
    }
  } else {
    pythonCache.delete(cacheKey);
    pythonCache.set(cacheKey, output);
  }
  const value = JSON.parse(output);
  if (typeof value?.error === 'string' && value.error.length <= 300) fail(400, value.error);
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('Python accounting response failed validation');
  return result.data;
}
