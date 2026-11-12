import test from 'node:test';
import assert from 'node:assert/strict';
import {previousPeriod} from '../src/charts/model.ts';

test('previous windows are adjacent and align sparse records without inventing points',()=>{
 const points=[{date:'2026-01-01',value:20},{date:'2026-01-08',value:30},{date:'2026-01-14',value:90}];
 const result=previousPeriod(points,'7D');
 assert.equal(result.from,'2026-01-01');assert.equal(result.to,'2026-01-07');
 assert.equal(result.byAlignedDate.get('2026-01-08').value,20);
 assert.equal(result.byAlignedDate.has('2026-01-14'),false);
 assert.deepEqual(result.records,[points[0]]);
});
test('missing earlier history and all-history ranges cannot imply a prior comparison',()=>{
 const points=[{date:'2026-01-08',value:30},{date:'2026-01-14',value:90}];
 assert.equal(previousPeriod(points,'7D'),null);assert.equal(previousPeriod(points,'ALL'),null);assert.equal(previousPeriod([],'30D'),null);
});
test('year-to-date comparisons use an equal calendar-day window across year boundaries',()=>{
 const points=[{date:'2025-12-29',value:1},{date:'2025-12-31',value:-2},{date:'2026-01-03',value:3}];
 const result=previousPeriod(points,'YTD');assert.equal(result.from,'2025-12-29');assert.equal(result.to,'2025-12-31');assert.equal(result.byAlignedDate.get('2026-01-03').value,-2);
});
test('an explicit as-of date determines the window and invalid dates are excluded',()=>{
 const result=previousPeriod([{date:'invalid',value:1},{date:'2026-01-01',value:2},{date:'2026-01-10',value:3},{date:'2026-01-31',value:4}],'7D','2026-01-14');
 assert.equal(result.from,'2026-01-01');assert.equal(result.to,'2026-01-07');assert.equal(result.records.length,1);
});
