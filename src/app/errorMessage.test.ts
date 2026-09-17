import { expect, test } from "vitest";
import { formatError, stripIpcErrorPrefix } from "./errorMessage";

test("unwraps an Electron remote method error", () => {
  expect(stripIpcErrorPrefix(
    "Error invoking remote method 'llm-provider:list-models': Error: 获取模型列表失败（HTTP 401）。"
  )).toBe("获取模型列表失败（HTTP 401）。");
});

test("unwraps a remote error that carries no inner error name", () => {
  expect(stripIpcErrorPrefix(
    "Error invoking remote method 'meeting:process': 音频转写尚未配置。"
  )).toBe("音频转写尚未配置。");
});

test("leaves a plain message untouched", () => {
  expect(stripIpcErrorPrefix("音频转写尚未配置。")).toBe("音频转写尚未配置。");
});

test("formats thrown values and non-errors alike", () => {
  expect(formatError(new Error("Error invoking remote method 'x': Error: 失败"))).toBe("失败");
  expect(formatError("plain string")).toBe("plain string");
});
