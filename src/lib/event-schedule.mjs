/**
 * Validate the device-local datetime values before converting them to UTC for
 * storage. A past meeting is allowed only once its end has passed, so officers
 * can enter completed meetings for attendance without scheduling reminders.
 *
 * @param {string} eventType
 * @param {string} startValue
 * @param {string} endValue
 * @param {number} nowMs
 * @returns {{ok: true, startsAt: Date, endsAt: Date | null, completedMeeting: boolean} | {ok: false, error: 'requiredEventFields' | 'endBeforeStart' | 'pastDateError'}}
 */
export function classifyEventSchedule(eventType, startValue, endValue, nowMs) {
  const startsAt = new Date(startValue);
  const endsAt = endValue ? new Date(endValue) : null;
  if (!startValue || Number.isNaN(startsAt.getTime()) ||
    (endsAt && Number.isNaN(endsAt.getTime()))) {
    return { ok: false, error: 'requiredEventFields' };
  }
  if (endsAt && endsAt <= startsAt) {
    return { ok: false, error: 'endBeforeStart' };
  }
  const completedMeeting = eventType === 'meeting' && !!endsAt && endsAt.getTime() <= nowMs;
  if (startsAt.getTime() < nowMs && !completedMeeting) {
    return { ok: false, error: 'pastDateError' };
  }
  return { ok: true, startsAt, endsAt, completedMeeting };
}
