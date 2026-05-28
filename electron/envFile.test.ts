import { describe, expect, test } from "vitest";

import { loadDotEnvFile } from "./envFile";

describe("loadDotEnvFile", () => {
  test("loads key-value pairs from a dotenv file without overriding existing environment", async () => {
    const env: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: "existing-key"
    };

    const result = await loadDotEnvFile({
      filePath: "C:/repo/.env",
      env,
      async readFile(filePath) {
        expect(filePath).toBe("C:/repo/.env");
        return [
          "# local MeetMap secrets",
          "OPENAI_API_KEY=from-file",
          "OPENAI_STRUCTURE_MODEL=\"gpt-4.1-mini\"",
          "OPENAI_TRANSCRIPTION_MODEL='gpt-4o-mini-transcribe'",
          "MEETMAP_DEMO_MODE=0"
        ].join("\n");
      }
    });

    expect(result).toEqual({
      loaded: true,
      keys: [
        "OPENAI_STRUCTURE_MODEL",
        "OPENAI_TRANSCRIPTION_MODEL",
        "MEETMAP_DEMO_MODE"
      ]
    });
    expect(env).toEqual({
      OPENAI_API_KEY: "existing-key",
      OPENAI_STRUCTURE_MODEL: "gpt-4.1-mini",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      MEETMAP_DEMO_MODE: "0"
    });
  });

  test("ignores a missing dotenv file", async () => {
    const env: NodeJS.ProcessEnv = {};

    await expect(
      loadDotEnvFile({
        filePath: "C:/repo/.env",
        env,
        async readFile() {
          throw Object.assign(new Error("missing"), {
            code: "ENOENT"
          });
        }
      })
    ).resolves.toEqual({
      loaded: false,
      keys: []
    });
  });
});
