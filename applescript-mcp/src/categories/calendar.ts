import { ScriptCategory } from "../types/index.js";
import { asString, asInt } from "../utils/escape.js";

/** Parse a "YYYY-MM-DD HH:MM:SS" string into bounded AppleScript-safe integers. */
function parseDateParts(value: unknown) {
  const s = String(value ?? "");
  return {
    year: asInt(s.slice(0, 4), 2000, 1970, 9999),
    month: asInt(s.slice(5, 7), 1, 1, 12),
    day: asInt(s.slice(8, 10), 1, 1, 31),
    hours: asInt(s.slice(11, 13), 0, 0, 23),
    minutes: asInt(s.slice(14, 16), 0, 0, 59),
    seconds: asInt(s.slice(17, 19), 0, 0, 59),
  };
}

/**
 * Emit AppleScript that builds a `date` variable from the full date/time.
 * Sets day to 1 first to avoid month-length overflow when reassigning fields.
 */
function buildDate(varName: string, value: unknown): string {
  const d = parseDateParts(value);
  return `
          set ${varName} to current date
          set day of ${varName} to 1
          set year of ${varName} to ${d.year}
          set month of ${varName} to ${d.month}
          set day of ${varName} to ${d.day}
          set time of ${varName} to (${d.hours} * hours + ${d.minutes} * minutes + ${d.seconds})`;
}

/**
 * Calendar-related scripts.
 * * add: adds a new event to Calendar
 * * list: List events for today
 */
export const calendarCategory: ScriptCategory = {
  name: "calendar",
  description: "Calendar operations",
  scripts: [
    {
      name: "add",
      description: "Add a new event to Calendar",
      schema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Event title",
          },
          startDate: {
            type: "string",
            description: "Start date and time (YYYY-MM-DD HH:MM:SS)",
          },
          endDate: {
            type: "string",
            description: "End date and time (YYYY-MM-DD HH:MM:SS)",
          },
          calendar: {
            type: "string",
            description:
              "Calendar name (optional; defaults to your first writable calendar)",
          },
        },
        required: ["title", "startDate", "endDate"],
      },
      script: (args) => {
        const calendarSelector = args.calendar
          ? `set targetCalendar to first calendar whose name is "${asString(args.calendar)}"`
          : `set targetCalendar to first calendar whose writable is true`;
        return `
        tell application "Calendar"
          try
            ${buildDate("theStartDate", args.startDate)}
            ${buildDate("theEndDate", args.endDate)}
            ${calendarSelector}
            tell targetCalendar
              make new event with properties {summary:"${asString(args.title)}", start date:theStartDate, end date:theEndDate}
            end tell
            return "Event \\"${asString(args.title)}\\" created in calendar \\"" & (name of targetCalendar) & "\\""
          on error errMsg
            return "Failed to add event: " & errMsg
          end try
        end tell
      `;
      },
    },
    {
      name: "list",
      description: "List upcoming events (default: next 7 days) across all calendars",
      schema: {
        type: "object",
        properties: {
          daysAhead: {
            type: "number",
            description: "Number of days ahead to include, starting today (default 7)",
          },
        },
      },
      script: (args) => {
        const daysAhead = asInt(args.daysAhead, 7, 1, 366);
        return `
      tell application "Calendar"
          set rangeStart to (current date)
          set time of rangeStart to 0
          set rangeEnd to rangeStart + (${daysAhead} * days)
          set eventList to {}
          -- Scan every calendar, but cap each with a short timeout so a huge
          -- read-only subscribed calendar (holidays, etc.) can't hang the query.
          repeat with calendarAccount in calendars
              try
                  with timeout of 3 seconds
                      set eventList to eventList & (every event of calendarAccount whose start date is greater than or equal to rangeStart and start date is less than rangeEnd)
                  end timeout
              end try
          end repeat
          if (count of eventList) is 0 then
              return "No events found in the next ${daysAhead} day(s)."
          end if
          set output to ""
          repeat with anEvent in eventList
              set d to start date of anEvent
              set e to end date of anEvent
              set dateStr to (year of d as string) & "-" & my pad2(month of d as integer) & "-" & my pad2(day of d)
              set startStr to my pad2(hours of d) & ":" & my pad2(minutes of d)
              set endStr to my pad2(hours of e) & ":" & my pad2(minutes of e)
              set output to output & dateStr & "  " & startStr & "-" & endStr & "  " & (summary of anEvent) & "\n"
          end repeat
          return output
      end tell

      on pad2(n)
          set s to (n as integer) as string
          if (count of s) < 2 then set s to "0" & s
          return s
      end pad2
      `;
      },
    },
  ],
};
