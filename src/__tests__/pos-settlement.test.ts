import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateTender,calculateDrawer,remainingCashReturn} from '../pos/settlement';

const policy={outstanding_minor:12000,cash_minor:12000,tendered_minor:15000,intent:'cash' as const,allow_cash:true,allow_electronic:false,allow_pending:false};
test('POS full cash applies only the invoice balance and gives exact change',()=>{
 assert.deepEqual(calculateTender(policy),{cash_applied_minor:12000,tendered_cash_minor:15000,change_minor:3000,electronic_request_minor:0,pending_minor:0});
 for(const change of [{cash_minor:12001},{cash_minor:10000},{tendered_minor:11999},{allow_cash:false},{outstanding_minor:0}])assert.throws(()=>calculateTender({...policy,...change}));
});
test('POS split tender requests only the unpaid electronic remainder',()=>{
 assert.deepEqual(calculateTender({...policy,intent:'split',cash_minor:4000,tendered_minor:5000,allow_electronic:true}),{cash_applied_minor:4000,tendered_cash_minor:5000,change_minor:1000,electronic_request_minor:8000,pending_minor:0});
 for(const cash_minor of [0,12000,13000])assert.throws(()=>calculateTender({...policy,intent:'split',cash_minor,allow_electronic:true}));
 assert.throws(()=>calculateTender({...policy,intent:'split',cash_minor:4000}));
});
test('POS electronic and pending intents cannot smuggle cash or bypass disabled methods',()=>{
 for(const intent of ['electronic','pending'] as const){
  const input={...policy,intent,cash_minor:0,tendered_minor:0,allow_electronic:true,allow_pending:true};
  const result=calculateTender(input);assert.equal(result.electronic_request_minor+result.pending_minor,12000);assert.equal(result.cash_applied_minor,0);
  assert.throws(()=>calculateTender({...input,cash_minor:1,tendered_minor:1}));
  assert.throws(()=>calculateTender({...input,tendered_minor:1}));
  assert.throws(()=>calculateTender({...input,allow_electronic:false,allow_pending:false}));
 }
});
test('POS drawer counts retain float, returns, adjustments and exact variance',()=>{
 assert.deepEqual(calculateDrawer(2000,[{kind:'receipt',amount_minor:12000},{kind:'return',amount_minor:-3000},{kind:'adjustment',amount_minor:-1000}],9500),{expected_minor:10000,counted_minor:9500,variance_minor:-500});
 assert.deepEqual(calculateDrawer(0,[],0),{expected_minor:0,counted_minor:0,variance_minor:0});
 for(const movement of [{kind:'receipt' as const,amount_minor:-1},{kind:'return' as const,amount_minor:1},{kind:'adjustment' as const,amount_minor:0}])assert.throws(()=>calculateDrawer(100,[movement]));
 assert.throws(()=>calculateDrawer(0,[{kind:'return',amount_minor:-1}]));
});
test('POS return capacity retains signs and rejects over-return and unsafe arithmetic',()=>{
 assert.equal(remainingCashReturn(12000,[-2000,-3000],7000),0);
 assert.throws(()=>remainingCashReturn(12000,[-2000,-3000],7001));
 assert.throws(()=>remainingCashReturn(12000,[2000],1));
 assert.throws(()=>remainingCashReturn(12000,[],0));
 for(const value of [NaN,Infinity,0.5,100_000_000_001,Number.MAX_SAFE_INTEGER]){
  assert.throws(()=>calculateTender({...policy,cash_minor:value}));assert.throws(()=>calculateDrawer(value,[]));assert.throws(()=>remainingCashReturn(value,[],1));
 }
 assert.throws(()=>calculateDrawer(100_000_000_000,[{kind:'receipt',amount_minor:1}]));
});
