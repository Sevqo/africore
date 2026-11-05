import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {configureTestEnv} from './helpers';
configureTestEnv('workflow-savepoints');
import {dbExec,dbRun,dbGet,dbTransaction,dbSavepoint,closeDb} from '../db';
after(closeDb);
test('a failed action rolls back its complete savepoint while the containing transaction can record failure',async()=>{
 await dbExec('CREATE TABLE IF NOT EXISTS fixture_savepoint_rows (id TEXT PRIMARY KEY,value TEXT NOT NULL)');await dbRun('DELETE FROM fixture_savepoint_rows');
 await dbTransaction(async()=>{await dbRun('INSERT INTO fixture_savepoint_rows(id,value) VALUES (?,?)',['outer','retained']);await assert.rejects(dbSavepoint(async()=>{await dbRun('INSERT INTO fixture_savepoint_rows(id,value) VALUES (?,?)',['partial','must roll back']);await dbRun('INSERT INTO fixture_savepoint_rows(id,value) VALUES (?,?)',['outer','duplicate error']);}));assert.equal(await dbGet('SELECT id FROM fixture_savepoint_rows WHERE id=?',['partial']),undefined);await dbRun('INSERT INTO fixture_savepoint_rows(id,value) VALUES (?,?)',['failure','recorded after recovery']);});
 assert.equal((await dbGet('SELECT value FROM fixture_savepoint_rows WHERE id=?',['outer'])).value,'retained');assert.equal((await dbGet('SELECT value FROM fixture_savepoint_rows WHERE id=?',['failure'])).value,'recorded after recovery');
});
test('successful nested savepoints remain subject to an outer rollback',async()=>{await assert.rejects(dbTransaction(async()=>{await dbSavepoint(async()=>{await dbRun('INSERT INTO fixture_savepoint_rows(id,value) VALUES (?,?)',['nested','not independently committed']);});throw Error('outer rollback');}));assert.equal(await dbGet('SELECT id FROM fixture_savepoint_rows WHERE id=?',['nested']),undefined);});
