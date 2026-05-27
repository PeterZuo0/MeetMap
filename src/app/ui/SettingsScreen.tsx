import type { LanguageOptionValue } from "../../features/settings/languageOptions";
import { LANGUAGE_OPTIONS } from "../../features/settings/languageOptions";
import type { ReactNode } from "react";
import type { AppSettings, ThemeMode, UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { ACCENT_OPTIONS } from "./theme";

export function SettingsScreen({
  settings,
  onChange
}: {
  settings: AppSettings;
  onChange(settings: AppSettings): void;
}) {
  const lang = settings.uiLanguage;

  return (
    <section className="pane" aria-label="Settings">
      <div className="screen-head">
        <div>
          <h1 className="h1">{label(lang, "Settings", "设置")}</h1>
          <p className="sub">{label(lang, "General product preferences for the local app.", "本地应用的通用产品偏好。")}</p>
        </div>
      </div>

      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">
          <button type="button">General</button>
        </nav>
        <div>
          <h2 className="h1">General</h2>
          <SettingsRow labelText="Theme">
            <select
              aria-label="Theme"
              className="select"
              onChange={(event) =>
                onChange({ ...settings, theme: event.target.value as ThemeMode })
              }
              value={settings.theme}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </SettingsRow>
          <SettingsRow labelText="Accent color">
            <div className="swatches" aria-label="Accent color">
              {ACCENT_OPTIONS.map((accent) => (
                <button
                  aria-label={`Accent color ${accent}`}
                  className={`swatch ${settings.accent === accent ? "active" : ""}`}
                  key={accent}
                  onClick={() => onChange({ ...settings, accent })}
                  style={{ background: accent }}
                  type="button"
                />
              ))}
            </div>
          </SettingsRow>
          <SettingsRow labelText="UI language">
            <select
              aria-label="UI language"
              className="select"
              onChange={(event) =>
                onChange({ ...settings, uiLanguage: event.target.value as UiLanguage })
              }
              value={settings.uiLanguage}
            >
              <option value="bi">Bilingual 中/EN</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </SettingsRow>
          <SettingsRow labelText="Default output language">
            <select
              aria-label="Default output language"
              className="select"
              onChange={(event) =>
                onChange({
                  ...settings,
                  defaultOutputLanguage: event.target.value as LanguageOptionValue
                })
              }
              value={settings.defaultOutputLanguage}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </SettingsRow>
        </div>
      </div>
    </section>
  );
}

function SettingsRow({
  labelText,
  children
}: {
  labelText: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <div className="h2">{labelText}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}
