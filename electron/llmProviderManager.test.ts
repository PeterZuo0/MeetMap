import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createLlmProviderManager } from "./llmProviderManager";

test("persists multiple providers while keeping API keys out of the public state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meetmap-llm-providers-"));
  const configPath = join(directory, "providers.json");
  try {
    const manager = createLlmProviderManager({
      configPath,
      encryptSecret: (value) => `encrypted:${Buffer.from(value).toString("base64")}`,
      decryptSecret: (value) => Buffer.from(value.replace("encrypted:", ""), "base64").toString()
    });
    await manager.load();
    const firstState = await manager.saveProvider({
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1/",
      model: "gpt-4.1-mini",
      apiStyle: "responses",
      apiKeyRequired: true,
      apiKey: "sk-secret"
    });
    await manager.saveProvider({
      name: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      model: "qwen3:8b",
      apiStyle: "chat_completions",
      apiKeyRequired: false
    });

    expect(firstState.providers[0]).toMatchObject({
      apiKeyConfigured: true,
      baseUrl: "https://api.openai.com/v1"
    });
    expect(firstState.providers[0]).not.toHaveProperty("apiKey");
    expect(manager.getState().providers).toHaveLength(2);
    expect(await readFile(configPath, "utf8")).not.toContain("sk-secret");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("requires a key for remote providers and allows keyless local providers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meetmap-llm-providers-"));
  try {
    const manager = createLlmProviderManager({
      configPath: join(directory, "providers.json"),
      encryptSecret: (value) => value,
      decryptSecret: (value) => value
    });
    await manager.load();
    await expect(manager.saveProvider({
      name: "Remote",
      baseUrl: "https://example.com/v1",
      model: "model",
      apiStyle: "responses",
      apiKeyRequired: true
    })).rejects.toThrow("需要填写 API Key");
    await expect(manager.saveProvider({
      name: "Local",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
      apiStyle: "chat_completions",
      apiKeyRequired: false
    })).resolves.toMatchObject({ providers: [expect.objectContaining({ name: "Local" })] });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
