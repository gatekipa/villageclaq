import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEventSchedule } from '../src/lib/event-schedule.mjs';

const start = '2026-10-10T18:00';
const end = '2026-10-10T19:00';
const startMs = new Date(start).getTime();

test('a completed meeting can be entered for attendance after its end', () => {
  const result = classifyEventSchedule('meeting', start, end, startMs + 90 * 60_000);
  assert.equal(result.ok, true);
  assert.equal(result.completedMeeting, true);
  assert.equal(result.startsAt.toISOString(), new Date(start).toISOString());
});

test('a future meeting remains upcoming', () => {
  const result = classifyEventSchedule('meeting', start, end, startMs - 60_000);
  assert.equal(result.ok, true);
  assert.equal(result.completedMeeting, false);
});

test('an ongoing meeting and a past social event cannot be backdated', () => {
  assert.deepEqual(classifyEventSchedule('meeting', start, end, startMs + 30 * 60_000),
    { ok: false, error: 'pastDateError' });
  assert.deepEqual(classifyEventSchedule('social', start, end, startMs + 90 * 60_000),
    { ok: false, error: 'pastDateError' });
});

test('invalid and reversed dates are explained before submission', () => {
  assert.deepEqual(classifyEventSchedule('meeting', '', end, startMs),
    { ok: false, error: 'requiredEventFields' });
  assert.deepEqual(classifyEventSchedule('meeting', start, start, startMs),
    { ok: false, error: 'endBeforeStart' });
});
