import { ScriptCategory } from "../types/index.js";
import { asString, asInt } from "../utils/escape.js";

/**
 * Contacts lookup via the Contacts app. Lets the assistant resolve a name to
 * real phone numbers / emails before sending a message or email. Read-only.
 * (First use triggers the macOS Contacts privacy prompt.)
 */
export const contactsCategory: ScriptCategory = {
  name: "contacts",
  description: "Contacts lookup",
  scripts: [
    {
      name: "search",
      description:
        "Find contacts whose name matches a query; returns their phone numbers and emails so you can disambiguate before messaging.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name (or part of a name) to search for" },
          limit: { type: "number", description: "Max contacts to return (default 10)", default: 10 },
        },
        required: ["name"],
      },
      script: (args) => `
        on joinList(lst)
          set AppleScript's text item delimiters to ", "
          set s to (lst as string)
          set AppleScript's text item delimiters to ""
          return s
        end joinList

        tell application "Contacts"
          set matchList to (every person whose name contains "${asString(args.name)}")
          if (count of matchList) is 0 then return "No contacts found matching \\"${asString(args.name)}\\""
          set output to ""
          repeat with i from 1 to (count of matchList)
            if i > ${asInt(args.limit, 10, 1, 50)} then exit repeat
            set p to item i of matchList
            set pName to name of p
            set phoneVals to (value of every phone of p)
            set emailVals to (value of every email of p)
            set output to output & pName & " | phones: " & my joinList(phoneVals) & " | emails: " & my joinList(emailVals) & linefeed
          end repeat
          return output
        end tell
      `,
    },
  ],
};
