import type { LanguageOptionValue } from "../../features/settings/languageOptions";
import { LANGUAGE_OPTIONS } from "../../features/settings/languageOptions";
import type { ReactNode } from "react";
import { useState } from "react";
import type { AppSettings, ThemeMode, UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";
import { ACCENT_OPTIONS } from "./theme";

export type SettingsSectionId =
  | "general"
  | "audio"
  | "language"
  | "transcription"
  | "export"
  | "api"
  | "privacy";

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  title: string;
  icon: "audio" | "download" | "file" | "mic" | "settings" | "spark";
}> = [
  { id: "general", title: "General", icon: "settings" },
  { id: "audio", title: "Audio devices", icon: "mic" },
  { id: "language", title: "Language", icon: "audio" },
  { id: "transcription", title: "Transcription & summary", icon: "spark" },
  { id: "export", title: "Export defaults", icon: "download" },
  { id: "api", title: "API keys", icon: "file" },
  { id: "privacy", title: "Privacy & storage", icon: "settings" }
];

type SettingsControlKey =
  | "autoDeleteCloudCopies"
  | "autoGain"
  | "cantonese"
  | "englishGB"
  | "englishUS"
  | "exportMapView"
  | "includeTimestamps"
  | "includeTranscriptAppendix"
  | "keepIntermediateArtifacts"
  | "mandarin"
  | "minimizeToTray"
  | "mixedCodeSwitching"
  | "noiseSuppression"
  | "openAfterExport"
  | "openAtStartup"
  | "preserveTranscriptLanguage"
  | "speakerDiarization"
  | "standaloneExport"
  | "uploadRecordedAudio"
  | "uploadSeparateTracks"
  | "useOutputLanguage";

export function SettingsScreen({
  settings,
  initialSection = "general",
  onChange
}: {
  settings: AppSettings;
  initialSection?: SettingsSectionId;
  onChange(settings: AppSettings): void;
}) {
  const lang = settings.uiLanguage;
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const updateControl = <Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]) =>
    onChange({ ...settings, [key]: value });

  return (
    <section className="pane settings-pane" aria-label="Settings">
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav-title">Settings</div>
          {SETTINGS_SECTIONS.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <Icon name={item.icon} size={14} />
              <span>{item.title}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "general" && (
            <GeneralSettings lang={lang} onChange={onChange} onControlChange={updateControl} settings={settings} />
          )}
          {section === "audio" && <AudioSettings onControlChange={updateControl} settings={settings} />}
          {section === "language" && (
            <LanguageSettings onChange={onChange} onControlChange={updateControl} settings={settings} />
          )}
          {section === "transcription" && <TranscriptionSettings onControlChange={updateControl} settings={settings} />}
          {section === "export" && <ExportSettings onControlChange={updateControl} settings={settings} />}
          {section === "api" && <ApiSettings />}
          {section === "privacy" && <PrivacySettings onControlChange={updateControl} settings={settings} />}
        </div>
      </div>
    </section>
  );
}

function GeneralSettings({
  settings,
  onChange,
  onControlChange,
  lang
}: {
  settings: AppSettings;
  onChange(settings: AppSettings): void;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
  lang: UiLanguage;
}) {
  return (
    <>
      <SettingsHeader
        title="General"
        description={label(lang, "General product preferences for the local app.", "本地应用的通用产品偏好。")}
      />

      <SettingsBlock title="Appearance">
        <SettingsRow labelText="Theme">
          <select
            aria-label="Theme"
            className="select compact"
            onChange={(event) => onChange({ ...settings, theme: event.target.value as ThemeMode })}
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
            className="select compact"
            onChange={(event) => onChange({ ...settings, uiLanguage: event.target.value as UiLanguage })}
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
            className="select compact"
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
      </SettingsBlock>

      <SettingsBlock title="Startup">
        <SettingsRow labelText="Open at Windows startup">
          <Toggle
            checked={settings.openAtStartup}
            labelText="Open at Windows startup"
            onChange={(checked) => onControlChange("openAtStartup", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Minimize to tray on close">
          <Toggle
            checked={settings.minimizeToTray}
            labelText="Minimize to tray on close"
            onChange={(checked) => onControlChange("minimizeToTray", checked)}
          />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Shortcuts">
        <KeyRow labelText="Start / stop recording" value="Ctrl + Alt + R" />
        <KeyRow labelText="Tag moment" value="M" />
        <KeyRow labelText="Open MeetMap" value="Ctrl + Shift + M" />
      </SettingsBlock>
    </>
  );
}

function AudioSettings({
  settings,
  onControlChange
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
}) {
  return (
    <>
      <SettingsHeader title="Audio devices" description="Windows capture preferences for the MVP recorder." />
      <SettingsBlock title="System audio capture">
        <SettingsRow labelText="Capture method">
          <ValueText>Windows WASAPI loopback</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Output device to capture">
          <ValueText>Default system output</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Ignore audio from these apps">
          <ChipList items={["MeetMap", "Teams preview", "Browser notifications"]} />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock title="Microphone">
        <SettingsRow labelText="Input device">
          <ValueText>Default communications device</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Noise suppression">
          <Toggle
            checked={settings.noiseSuppression}
            labelText="Noise suppression"
            onChange={(checked) => onControlChange("noiseSuppression", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Auto-gain control">
          <Toggle
            checked={settings.autoGain}
            labelText="Auto-gain control"
            onChange={(checked) => onControlChange("autoGain", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Voice activity detection">
          <ValueText>Keep active speech, drop silence under threshold</ValueText>
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function LanguageSettings({
  settings,
  onChange,
  onControlChange
}: {
  settings: AppSettings;
  onChange(settings: AppSettings): void;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
}) {
  return (
    <>
      <SettingsHeader title="Language" description="Defaults for mixed Chinese-English meetings and generated output." />
      <SettingsBlock title="Default output language">
        <SettingsRow labelText="Output mode">
          <SegmentedControl
            onChange={(value) =>
              onChange({
                ...settings,
                defaultOutputLanguage: value as LanguageOptionValue
              })
            }
            options={LANGUAGE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            value={settings.defaultOutputLanguage}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock
        title="Recognition languages"
        description="Help the model by narrowing likely speech languages for code-switching meetings."
      >
        <SettingsRow labelText="Mandarin Chinese (zh-CN)">
          <Toggle
            checked={settings.mandarin}
            labelText="Mandarin Chinese (zh-CN)"
            onChange={(checked) => onControlChange("mandarin", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Cantonese (zh-HK)">
          <Toggle
            checked={settings.cantonese}
            labelText="Cantonese (zh-HK)"
            onChange={(checked) => onControlChange("cantonese", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="English (en-US)">
          <Toggle
            checked={settings.englishUS}
            labelText="English (en-US)"
            onChange={(checked) => onControlChange("englishUS", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="English (en-GB)">
          <Toggle
            checked={settings.englishGB}
            labelText="English (en-GB)"
            onChange={(checked) => onControlChange("englishGB", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Mixed code-switching">
          <Toggle
            checked={settings.mixedCodeSwitching}
            labelText="Mixed code-switching"
            onChange={(checked) => onControlChange("mixedCodeSwitching", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock
        title="Custom vocabulary"
        description="Names, product terms, and acronyms that should not be misheard."
      >
        <ChipList items={["MeetMap", "会图", "WASAPI", "Realtek", "Tencent STT", "diarization", "会议室", "Maya"]} />
        <p className="settings-note">28 words · Uploaded to cloud transcription as biasing hints</p>
      </SettingsBlock>
    </>
  );
}

function TranscriptionSettings({
  settings,
  onControlChange
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
}) {
  return (
    <>
      <SettingsHeader title="Transcription & summary" description="Cloud processing defaults used after a meeting ends." />
      <SettingsBlock title="Transcription">
        <SettingsRow labelText="Transcription provider">
          <ValueText>OpenAI audio transcription</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Model">
          <ValueText>gpt-4o transcribe</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Speaker diarization">
          <Toggle
            checked={settings.speakerDiarization}
            labelText="Speaker diarization"
            onChange={(checked) => onControlChange("speakerDiarization", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Preserve transcript language">
          <Toggle
            checked={settings.preserveTranscriptLanguage}
            labelText="Preserve transcript language"
            onChange={(checked) => onControlChange("preserveTranscriptLanguage", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock title="Summary">
        <SettingsRow labelText="Summary model">
          <ValueText>OpenAI Responses</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Structure depth">
          <ValueText>Decisions, action items, risks, and topic map</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Use output language setting">
          <Toggle
            checked={settings.useOutputLanguage}
            labelText="Use output language setting"
            onChange={(checked) => onControlChange("useOutputLanguage", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function ExportSettings({
  settings,
  onControlChange
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
}) {
  return (
    <>
      <SettingsHeader title="Export defaults" description="Generated documents share the same structured meeting JSON." />
      <SettingsBlock title="Word document">
        <SettingsRow labelText="Template">
          <ValueText>MeetMap executive summary</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Include transcript appendix">
          <Toggle
            checked={settings.includeTranscriptAppendix}
            labelText="Include transcript appendix"
            onChange={(checked) => onControlChange("includeTranscriptAppendix", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Include timestamps">
          <Toggle
            checked={settings.includeTimestamps}
            labelText="Include timestamps"
            onChange={(checked) => onControlChange("includeTimestamps", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock title="Structure map HTML">
        <SettingsRow labelText="Standalone export">
          <Toggle
            checked={settings.standaloneExport}
            labelText="Standalone export"
            onChange={(checked) => onControlChange("standaloneExport", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Default view">
          <SegmentedControl
            onChange={(value) => onControlChange("exportMapView", value as AppSettings["exportMapView"])}
            options={[
              { label: "Tree", value: "tree" },
              { label: "Radial", value: "radial" },
              { label: "Timeline", value: "timeline" }
            ]}
            value={settings.exportMapView}
          />
        </SettingsRow>
        <SettingsRow labelText="Open after export">
          <Toggle
            checked={settings.openAfterExport}
            labelText="Open after export"
            onChange={(checked) => onControlChange("openAfterExport", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function ApiSettings() {
  return (
    <>
      <SettingsHeader title="API keys" description="Local credentials are read from environment configuration." />
      <SettingsBlock title="Providers">
        <SettingsRow labelText="OpenAI">
          <div className="settings-key-status">
            <span className="status-pill positive">Configured locally</span>
            <span className="settings-note">Loaded from .env or process environment. The key is never displayed here.</span>
          </div>
        </SettingsRow>
        <SettingsRow labelText="Credential storage">
          <ValueText>Environment first, Windows Credential Manager planned</ValueText>
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function PrivacySettings({
  settings,
  onControlChange
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
}) {
  return (
    <>
      <SettingsHeader title="Privacy & storage" description="Controls for local meeting files and cloud processing consent." />
      <SettingsBlock title="What gets uploaded">
        <SettingsRow labelText="Upload recorded audio after meeting ends">
          <Toggle
            checked={settings.uploadRecordedAudio}
            labelText="Upload recorded audio after meeting ends"
            onChange={(checked) => onControlChange("uploadRecordedAudio", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Upload microphone and system tracks separately">
          <Toggle
            checked={settings.uploadSeparateTracks}
            labelText="Upload microphone and system tracks separately"
            onChange={(checked) => onControlChange("uploadSeparateTracks", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Auto-delete cloud processing copies">
          <Toggle
            checked={settings.autoDeleteCloudCopies}
            labelText="Auto-delete cloud processing copies"
            onChange={(checked) => onControlChange("autoDeleteCloudCopies", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock title="Local storage">
        <SettingsRow labelText="Recording folder">
          <ValueText>meetings/{`{meetingId}`}/audio</ValueText>
        </SettingsRow>
        <SettingsRow labelText="Keep intermediate artifacts">
          <Toggle
            checked={settings.keepIntermediateArtifacts}
            labelText="Keep intermediate artifacts"
            onChange={(checked) => onControlChange("keepIntermediateArtifacts", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText="Auto-archive after">
          <ValueText>90 days</ValueText>
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function SettingsHeader({ title, description }: { title: string; description: ReactNode }) {
  return (
    <header className="settings-header">
      <h1 className="h1">{title}</h1>
      <p className="sub">{description}</p>
    </header>
  );
}

function SettingsBlock({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-block">
      <div className="settings-block-head">
        <h2 className="h2">{title}</h2>
        {description ? <p className="sub">{description}</p> : null}
      </div>
      <div className="settings-block-body">{children}</div>
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
      <div className="settings-row-label">{labelText}</div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function KeyRow({ labelText, value }: { labelText: string; value: string }) {
  return (
    <SettingsRow labelText={labelText}>
      <span className="kbd">{value}</span>
    </SettingsRow>
  );
}

function Toggle({
  checked = false,
  labelText,
  onChange
}: {
  checked?: boolean;
  labelText: string;
  onChange(checked: boolean): void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={labelText}
      className={`toggle ${checked ? "checked" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span />
    </button>
  );
}

function ValueText({ children }: { children: ReactNode }) {
  return <span className="settings-value">{children}</span>;
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="settings-chip-list">
      {items.map((item) => (
        <span className="chip" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={option.value === value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
