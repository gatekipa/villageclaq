// ─── Calendar Integration Utilities ──────────────────────────────────────────

interface GenerateIcsFileParams {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location: string;
  organizerName: string;
  organizerEmail: string;
}

/**
 * Format a Date to ICS datetime format: YYYYMMDDTHHMMSSZ
 */
function formatIcsDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Escape special characters for ICS text fields.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate a unique identifier for the ICS event.
 */
function generateUid(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}@villageclaq.com`;
}

/**
 * Generate an .ics file content string for calendar import.
 *
 * The returned string can be served as a file download with
 * Content-Type: text/calendar and .ics extension.
 */
export function generateIcsFile(params: GenerateIcsFileParams): string {
  const { title, description, startDate, endDate, location, organizerName, organizerEmail } =
    params;

  const now = new Date();
  const uid = generateUid();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VillageClaq//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `ORGANIZER;CN=${escapeIcsText(organizerName)}:mailto:${organizerEmail}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(title)} starts in 30 minutes`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(title)} is tomorrow`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

// ─── Google Calendar URL ────────────────────────────────────────────────────

interface GenerateGoogleCalendarUrlParams {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location: string;
}

/**
 * Format a Date to Google Calendar URL format: YYYYMMDDTHHMMSSZ
 * (Same format as ICS but used in URL parameters)
 */
function formatGoogleDate(date: Date): string {
  return formatIcsDate(date);
}

/**
 * Generate a Google Calendar URL that opens the "add event" form pre-filled.
 *
 * Users can click this link to add the event directly to their Google Calendar.
 */
export function generateGoogleCalendarUrl(params: GenerateGoogleCalendarUrlParams): string {
  const { title, description, startDate, endDate, location } = params;

  const baseUrl = 'https://calendar.google.com/calendar/render';

  const queryParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    details: description,
    location: location,
    sf: 'true',
    output: 'xml',
  });

  return `${baseUrl}?${queryParams.toString()}`;
}
