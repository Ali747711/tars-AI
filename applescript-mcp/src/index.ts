import { argv } from "node:process";
import { pathToFileURL } from "node:url";

import { AppleScriptFramework } from "./framework.js";
import { systemCategory } from "./categories/system.js";
import { calendarCategory } from "./categories/calendar.js";
import { finderCategory } from "./categories/finder.js";
import { clipboardCategory } from "./categories/clipboard.js";
import { notificationsCategory } from "./categories/notifications.js";
import { itermCategory } from "./categories/iterm.js";
import { mailCategory } from "./categories/mail.js";
import { pagesCategory } from "./categories/pages.js";
import { shortcutsCategory } from "./categories/shortcuts.js";
import { messagesCategory } from "./categories/messages.js";
import { notesCategory } from "./categories/notes.js";
import { chromeCategory } from "./categories/chrome.js";
import { telegramCategory } from "./categories/telegram.js";
import { telegramApiCategory } from "./categories/telegramApi.js";
import { filesCategory } from "./categories/files.js";
import { musicCategory } from "./categories/music.js";
import { contactsCategory } from "./categories/contacts.js";
import { screenCategory } from "./categories/screen.js";

function main(): void {
  const server = new AppleScriptFramework({
    name: "applescript-server",
    version: "1.0.4",
    debug: false,
  });

  // Log startup information using stderr (server isn't connected yet)
  console.error(`[INFO] Starting AppleScript MCP server - PID: ${process.pid}`);

  // Add all categories
  console.error("[INFO] Registering categories...");
  server.addCategory(systemCategory);
  server.addCategory(calendarCategory);
  server.addCategory(finderCategory);
  server.addCategory(clipboardCategory);
  server.addCategory(notificationsCategory);
  server.addCategory(itermCategory);
  server.addCategory(mailCategory);
  server.addCategory(pagesCategory);
  server.addCategory(shortcutsCategory);
  server.addCategory(messagesCategory);
  server.addCategory(notesCategory);
  server.addCategory(chromeCategory);
  server.addCategory(telegramCategory);
  server.addCategory(telegramApiCategory);
  server.addCategory(filesCategory);
  server.addCategory(musicCategory);
  server.addCategory(contactsCategory);
  server.addCategory(screenCategory);
  console.error(`[INFO] Registered ${18} categories successfully`);

  // Start the server
  console.error("[INFO] Starting server...");
  server.run()
    .then(() => {
      console.error("[NOTICE] Server started successfully");
    })
    .catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EMERGENCY] Failed to start server: ${errorMessage}`);
      console.error(error);
    });
}

// Only boot the server when this file is executed directly (e.g. `node dist/index.js`).
// Guards against the test runner / imports auto-starting the stdio server and hanging.
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main();
}
