import { readFile as nodeReadFile } from "node:fs/promises";

export type DotEnvLoadResult = {
  loaded: boolean;
  keys: string[];
};

export type LoadDotEnvFileOptions = {
  filePath: string;
  env: NodeJS.ProcessEnv;
  readFile?: (filePath: string) => Promise<string>;
};

const DOTENV_LINE_PATTERN = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export async function loadDotEnvFile({
  filePath,
  env,
  readFile = (path) => nodeReadFile(path, "utf8")
}: LoadDotEnvFileOptions): Promise<DotEnvLoadResult> {
  let content: string;

  try {
    content = await readFile(filePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        loaded: false,
        keys: []
      };
    }

    throw error;
  }

  const loadedKeys: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);

    if (!parsed || env[parsed.key] !== undefined) {
      continue;
    }

    env[parsed.key] = parsed.value;
    loadedKeys.push(parsed.key);
  }

  return {
    loaded: true,
    keys: loadedKeys
  };
}

function parseDotEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();

  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const match = DOTENV_LINE_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: unwrapQuotedValue(match[2].trim())
  };
}

function unwrapQuotedValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
