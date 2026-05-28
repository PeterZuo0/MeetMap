import type { ReactNode } from "react";
import type { UiLanguage } from "../meetMapApi";

export function label(lang: UiLanguage, en: string, zh: string): ReactNode {
  if (lang === "en") {
    return en;
  }

  if (lang === "zh") {
    return zh;
  }

  return (
    <>
      {en} <span className="zh-inline">{zh}</span>
    </>
  );
}

export function text(lang: UiLanguage, en: string, zh: string): string {
  if (lang === "zh") {
    return zh;
  }

  if (lang === "bi") {
    return `${en} ${zh}`;
  }

  return en;
}
