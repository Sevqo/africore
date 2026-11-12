import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesNotification,notificationDateGroup} from '../src/apps/notification-model.ts';
test('notification filters use real category and read/approval states before paging',()=>{
 const rows=[{title:'Invoice issued',body:'Review saved invoice',category:'invoices',read_at:null,severity:'info'},{title:'Order saved',body:'Order details',category:'orders',read_at:'2026-11-12',severity:'info'},{title:'Review requested',category:'team',severity:'approval_required',read_at:null}];
 assert.deepEqual(rows.filter(n=>matchesNotification(n,'Finance','invoice')), [rows[0]]);
 assert.deepEqual(rows.filter(n=>matchesNotification(n,'Orders','')), [rows[1]]);
 assert.equal(rows.filter(n=>matchesNotification(n,'Unread','')).length,2);
 assert.deepEqual(rows.filter(n=>matchesNotification(n,'Approvals','')), [rows[2]]);
 assert.equal(matchesNotification(rows[0],'All','not found'),false);
});
test('notification groups use Nairobi dates across UTC midnight',()=>{
 const now=new Date('2026-11-12T00:30:00Z');
 assert.equal(notificationDateGroup('2026-11-11T22:00:00Z',now),'Today');
 assert.equal(notificationDateGroup('2026-11-10T22:00:00Z',now),'Yesterday');
 assert.equal(notificationDateGroup('2026-11-09T10:00:00Z',now),'Earlier');
});
