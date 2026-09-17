import { expect, test } from "vitest";
import { buildModelOptions, createModelsUrl, parseModelListResponse } from "./llmModelCatalog";

test("builds the models endpoint from a base url", () => {
  expect(createModelsUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/models");
  expect(createModelsUrl("http://localhost:11434/v1/ ")).toBe("http://localhost:11434/v1/models");
  expect(createModelsUrl("http://localhost:1234/v1/models")).toBe("http://localhost:1234/v1/models");
});

test("rejects a missing or non-http base url", () => {
  expect(() => createModelsUrl("  ")).toThrow(/API Base URL/);
  expect(() => createModelsUrl("localhost:11434")).toThrow(/http/);
});

test("reads model ids from the OpenAI response shape", () => {
  expect(parseModelListResponse({
    object: "list",
    data: [{ id: "gpt-4.1-mini" }, { id: "gpt-4o-mini" }, { id: "gpt-4.1-mini" }]
  })).toEqual(["gpt-4.1-mini", "gpt-4o-mini"]);
});

test("reads model ids from bare array and name-only variants", () => {
  expect(parseModelListResponse(["qwen3:8b", " llama3 "])).toEqual(["llama3", "qwen3:8b"]);
  expect(parseModelListResponse({ models: [{ name: "local-model" }] })).toEqual(["local-model"]);
});

test("rejects an unrecognised response", () => {
  expect(() => parseModelListResponse({ error: "nope" })).toThrow(/无法识别/);
});

test("keeps the configured model selectable when the service does not list it", () => {
  expect(buildModelOptions({
    current: "custom-deployment",
    fetched: ["gpt-4.1-mini"]
  })).toEqual(["custom-deployment", "gpt-4.1-mini"]);
});

test("falls back to the preset models before anything is fetched", () => {
  expect(buildModelOptions({ current: "gpt-4.1-mini", fallback: ["gpt-4.1-mini"] }))
    .toEqual(["gpt-4.1-mini"]);
  expect(buildModelOptions({ current: "", fallback: [] })).toEqual([]);
});
