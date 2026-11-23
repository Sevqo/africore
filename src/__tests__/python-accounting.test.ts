import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTaxWithPython } from '../erp/python-accounting';

test('Python accounting adapter rounds a half minor unit up exactly', async () => {
  assert.deepEqual(await calculateTaxWithPython(10, 1500), {
    base_minor: 10,
    rate_bps: 1500,
    tax_minor: 2,
    total_minor: 12,
    rounding: 'half_up_once_to_integer_minor_unit',
  });
});

test('Python accounting adapter rejects invalid values instead of returning a partial result', async () => {
  await assert.rejects(calculateTaxWithPython(0, 1500), /calculation failed/);
  await assert.rejects(calculateTaxWithPython(100, 10001), /calculation failed/);
});
