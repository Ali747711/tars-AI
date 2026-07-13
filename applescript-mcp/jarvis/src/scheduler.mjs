// Scheduled routines: stored cron jobs whose prompt is run unattended through
// the agent, with the spoken result delivered via TTS. Persisted to
// ~/.jarvis/routines.json.

import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./store.mjs";

const FILE = "routines.json";

/**
 * @param {object} deps
 * @param {(prompt:string)=>Promise<void>} deps.runPrompt  executes a routine prompt
 */
export function createScheduler({ runPrompt }) {
  let routines = readJson(FILE, []); // [{ id, name, cron, prompt, enabled }]
  const jobs = new Map();

  function scheduleAll() {
    for (const job of jobs.values()) job.stop();
    jobs.clear();
    for (const r of routines) {
      if (!r.enabled || !cron.validate(r.cron)) continue;
      const job = cron.schedule(r.cron, () => {
        Promise.resolve(runPrompt(r.prompt)).catch((e) =>
          console.error(`[jarvis] routine "${r.name}" failed:`, e?.message ?? e),
        );
      });
      jobs.set(r.id, job);
    }
    console.error(`[jarvis] scheduler: ${jobs.size} active routine(s)`);
  }

  scheduleAll();

  return {
    list: () => routines,
    add: ({ name, cron: expr, prompt, enabled = true }) => {
      if (!cron.validate(expr)) throw new Error(`invalid cron expression: ${expr}`);
      const r = { id: randomUUID(), name: name || "Routine", cron: expr, prompt, enabled };
      routines = [...routines, r];
      writeJson(FILE, routines);
      scheduleAll();
      return r;
    },
    remove: (id) => {
      routines = routines.filter((r) => r.id !== id);
      writeJson(FILE, routines);
      scheduleAll();
    },
    toggle: (id) => {
      routines = routines.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      writeJson(FILE, routines);
      scheduleAll();
    },
  };
}
