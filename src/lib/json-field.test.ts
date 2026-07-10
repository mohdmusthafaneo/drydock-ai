import assert from "node:assert/strict";
import { test } from "node:test";
import { asJsonInput, readJsonField, stringifyJsonField } from "./json-field";

test("readJsonField returns fallback for nullish values", () => {
  assert.deepEqual(readJsonField(null, { ok: true }), { ok: true });
  assert.deepEqual(readJsonField(undefined, ["fallback"]), ["fallback"]);
});

test("readJsonField parses strings and falls back on invalid JSON", () => {
  assert.deepEqual(readJsonField('{"a":1}', {}), { a: 1 });
  assert.deepEqual(readJsonField("[1,2]", []), [1, 2]);
  assert.deepEqual(readJsonField("not-json", { fallback: true }), { fallback: true });
});

test("readJsonField casts existing JSON values", () => {
  const objectValue = { nested: true };
  const arrayValue = ["a", "b"];

  assert.equal(readJsonField(objectValue, {}), objectValue);
  assert.equal(readJsonField(arrayValue, []), arrayValue);
  assert.equal(readJsonField(42, 0), 42);
  assert.equal(readJsonField(false, true), false);
});

test("asJsonInput parses object and array strings without double encoding", () => {
  assert.deepEqual(asJsonInput('{"a":1}'), { a: 1 });
  assert.deepEqual(asJsonInput("[1,2]"), [1, 2]);
  assert.equal(asJsonInput("plain string"), "plain string");
  assert.equal(asJsonInput('"already a json string"'), '"already a json string"');
});

test("stringifyJsonField preserves strings and serializes values", () => {
  assert.equal(stringifyJsonField('{"a":1}'), '{"a":1}');
  assert.equal(stringifyJsonField({ a: 1 }), '{"a":1}');
  assert.equal(stringifyJsonField(["a"]), '["a"]');
});
