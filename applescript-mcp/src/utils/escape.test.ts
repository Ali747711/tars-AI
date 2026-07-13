import { test } from "node:test";
import assert from "node:assert/strict";
import { asString, asQuoted, asSqlLiteral, asInt } from "./escape.js";

test("asString escapes backslashes and double quotes", () => {
  assert.equal(asString('a"b'), 'a\\"b');
  assert.equal(asString("a\\b"), "a\\\\b");
});

test("asString neutralises newlines (AppleScript breakout)", () => {
  const attack = 'Calculator"\nactivate\nend tell\ndo shell script "rm -rf ~"';
  const rendered = `tell application "${asString(attack)}"`;
  // A real closing-quote-then-newline would let the attacker inject AppleScript.
  assert.ok(!/"\n/.test(rendered), "must not contain a literal quote+newline breakout");
  assert.ok(!rendered.includes("\n"), "must not contain raw newlines");
});

test("asString handles null/undefined safely", () => {
  assert.equal(asString(null), "");
  assert.equal(asString(undefined), "");
});

test("asQuoted wraps in escaped double quotes", () => {
  assert.equal(asQuoted("hi"), '"hi"');
  assert.equal(asQuoted('a"b'), '"a\\"b"');
});

test("asSqlLiteral doubles single quotes", () => {
  assert.equal(asSqlLiteral("x' OR '1'='1"), "x'' OR ''1''=''1");
});

test("asInt coerces, bounds, and falls back", () => {
  assert.equal(asInt(50, 10), 50);
  assert.equal(asInt("abc", 30), 30); // junk -> fallback
  assert.equal(asInt("5; DROP TABLE", 99), 99); // partial-numeric junk -> fallback
  assert.equal(asInt(999999, 10, 1, 1000), 1000); // clamp to max
  assert.equal(asInt(-5, 10, 0, 100), 0); // clamp to min
});
