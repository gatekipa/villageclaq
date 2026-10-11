import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/attendance-rate.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { attendanceRate } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test('attendance rate uses the standing denominator and treats no evidence separately', () => {
  assert.equal(attendanceRate([]), null);
  assert.equal(attendanceRate([{ status: 'excused' }]), null);
  assert.equal(attendanceRate([{ status: 'present' }, { status: 'late' }, { status: 'excused' }]), 100);
  assert.equal(attendanceRate([{ status: 'present' }, { status: 'absent' }, { status: 'excused' }]), 50);
});
