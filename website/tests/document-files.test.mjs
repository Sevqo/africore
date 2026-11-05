import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeDocumentFilename,readDocumentFile} from '../src/apps/document-files.ts';
test('ordinary upload names become bounded plain filenames while retaining their permitted type',()=>{
 for(const name of ['Invoice (1).PDF','Résumé final.txt','../../reference.pdf','C:\\private\\photo.JPEG','NUL.txt','CON.report.txt','x'.repeat(300)+'.png','📄.txt']){const safe=safeDocumentFilename(name);assert.ok(safe.length<=120);assert.match(safe,/^[a-zA-Z0-9][a-zA-Z0-9_. -]*\.(?:pdf|txt|jpeg|png)$/);assert.ok(!safe.includes('..'));assert.ok(!/^(?:NUL|CON)\./i.test(safe));}
 assert.equal(safeDocumentFilename('Invoice (1).PDF'),'Invoice _1_.pdf');assert.throws(()=>safeDocumentFilename('invoice.pdf.exe'));assert.throws(()=>safeDocumentFilename('without-extension'));
});
test('empty and oversized file selections fail before any browser read or upload',async()=>{await assert.rejects(readDocumentFile({name:'empty.txt',size:0}),/non-empty/);await assert.rejects(readDocumentFile({name:'large.txt',size:512*1024+1}),/512 KiB/);});
