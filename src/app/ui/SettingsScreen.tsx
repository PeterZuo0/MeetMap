import type { LanguageOptionValue } from "../../features/settings/languageOptions";
import { LANGUAGE_OPTIONS } from "../../features/settings/languageOptions";
import type { ReactNode } from "react";
import { useState } from "react";
import type { AppSettings, RecordingAudioDevice, SettingsRuntimeStatus, ThemeMode, UiLanguage } from "../meetMapApi";
import { text } from "./copy";
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

type SettingsControlKey =
  | "cantonese"
  | "defaultMicrophoneDeviceId"
  | "defaultSystemAudioDeviceId"
  | "englishGB"
  | "englishUS"
  | "includeTimestamps"
  | "includeTranscriptAppendix"
  | "mandarin"
  | "mixedCodeSwitching"
  | "openAtStartup"
  | "preserveTranscriptLanguage"
  | "speakerDiarization"
  | "uploadRecordedAudio";

const SECTION_META: Array<{
  id: SettingsSectionId;
  en: string;
  zh: string;
  icon: "audio" | "download" | "file" | "mic" | "settings" | "spark";
}> = [
  { id: "general", en: "General", zh: "通用", icon: "settings" },
  { id: "audio", en: "Audio devices", zh: "音频设备", icon: "mic" },
  { id: "language", en: "Language", zh: "语言", icon: "audio" },
  { id: "transcription", en: "Transcription & summary", zh: "转写与摘要", icon: "spark" },
  { id: "export", en: "Export defaults", zh: "导出默认值", icon: "download" },
  { id: "api", en: "API status", zh: "API 状态", icon: "file" },
  { id: "privacy", en: "Privacy & upload", zh: "隐私与上传", icon: "settings" }
];

export function SettingsScreen({
  apiStatus,
  audioDevices,
  settings,
  initialSection = "general",
  onChange
}: {
  apiStatus: SettingsRuntimeStatus | null;
  audioDevices: RecordingAudioDevice[];
  settings: AppSettings;
  initialSection?: SettingsSectionId;
  onChange(settings: AppSettings): void;
}) {
  const lang = settings.uiLanguage;
  const [section, setSection] = useState<SettingsSectionId>(initialSection);
  const [saveFeedback, setSaveFeedback] = useState<"idle" | "saved">("idle");
  const saveSettings = (nextSettings: AppSettings) => {
    setSaveFeedback("saved");
    onChange(nextSettings);
  };
  const updateControl = <Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]) =>
    saveSettings({ ...settings, [key]: value });

  return (
    <section className="pane settings-pane" aria-label={t(lang, "Settings", "设置")}>
      <div className="settings-grid">
        <nav className="settings-nav" aria-label={t(lang, "Settings sections", "设置分区")}>
          <div className="settings-nav-title">{t(lang, "Settings", "设置")}</div>
          {SECTION_META.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <Icon name={item.icon} size={14} />
              <span>{t(lang, item.en, item.zh)}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <div className="settings-save-status" role="status" aria-live="polite">
            {saveFeedback === "saved" ? t(lang, "Settings saved", "设置已保存") : t(lang, "Changes save automatically", "更改会自动保存")}
          </div>
          {section === "general" ? (
            <GeneralSettings lang={lang} onChange={saveSettings} onControlChange={updateControl} settings={settings} />
          ) : null}
          {section === "audio" ? (
            <AudioSettings audioDevices={audioDevices} lang={lang} onControlChange={updateControl} settings={settings} />
          ) : null}
          {section === "language" ? (
            <LanguageSettings lang={lang} onChange={saveSettings} onControlChange={updateControl} settings={settings} />
          ) : null}
          {section === "transcription" ? (
            <TranscriptionSettings lang={lang} onControlChange={updateControl} settings={settings} />
          ) : null}
          {section === "export" ? <ExportSettings lang={lang} onControlChange={updateControl} settings={settings} /> : null}
          {section === "api" ? <ApiSettings apiStatus={apiStatus} lang={lang} /> : null}
          {section === "privacy" ? <PrivacySettings lang={lang} onControlChange={updateControl} settings={settings} /> : null}
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
        title={t(lang, "General", "通用")}
        description={t(lang, "Local app appearance and startup behavior.", "本地应用外观和启动行为。")}
      />

      <SettingsBlock lang={lang} titleEn="Appearance" titleZh="外观">
        <SettingsRow labelText={settingsLabel(lang, "Theme", "主题")}>
          <select
            aria-label={t(lang, "Theme", "主题")}
            className="select compact"
            onChange={(event) => onChange({ ...settings, theme: event.target.value as ThemeMode })}
            value={settings.theme}
          >
            <option value="light">{t(lang, "Light", "浅色")}</option>
            <option value="dark">{t(lang, "Dark", "深色")}</option>
          </select>
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Accent color", "强调色")}>
          <div className="swatches" aria-label={t(lang, "Accent color", "强调色")}>
            {ACCENT_OPTIONS.map((accent) => (
              <button
                aria-label={`${t(lang, "Accent color", "强调色")} ${accent}`}
                className={`swatch ${settings.accent === accent ? "active" : ""}`}
                key={accent}
                onClick={() => onChange({ ...settings, accent })}
                style={{ background: accent }}
                type="button"
              />
            ))}
          </div>
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "UI language", "界面语言")}>
          <select
            aria-label={t(lang, "UI language", "界面语言")}
            className="select compact"
            onChange={(event) => onChange({ ...settings, uiLanguage: event.target.value as UiLanguage })}
            value={settings.uiLanguage}
          >
            <option value="bi">Bilingual 中/EN</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Default output language", "默认输出语言")}>
          <select
            aria-label={t(lang, "Default output language", "默认输出语言")}
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
                {localizedLanguageOption(option.value, lang)}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock lang={lang} titleEn="Startup" titleZh="启动">
        <SettingsRow
          description={t(lang, "Starts MeetMap when you sign in to Windows.", "登录 Windows 后自动启动 MeetMap。")}
          labelText={settingsLabel(lang, "Open at Windows startup", "随 Windows 启动")}
        >
          <Toggle
            checked={settings.openAtStartup}
            labelText={t(lang, "Open at Windows startup", "随 Windows 启动")}
            onChange={(checked) => onControlChange("openAtStartup", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function AudioSettings({
  audioDevices,
  settings,
  onControlChange,
  lang
}: {
  audioDevices: RecordingAudioDevice[];
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
  lang: UiLanguage;
}) {
  return (
    <>
      <SettingsHeader
        title={t(lang, "Audio devices", "音频设备")}
        description={t(lang, "Default devices used for recording setup and probes.", "录制设置和音频检测默认使用的设备。")}
      />
      <SettingsBlock lang={lang} titleEn="Capture defaults" titleZh="采集默认值">
        <SettingsRow labelText={settingsLabel(lang, "System audio input", "系统声音输入")}>
          <DeviceSelect
            ariaLabel={t(lang, "Default system audio input", "默认系统声音输入")}
            devices={audioDevices.filter((device) => device.track === "system")}
            fallbackLabel={t(lang, "Default Windows system audio", "默认 Windows 系统声音")}
            onChange={(deviceId) => onControlChange("defaultSystemAudioDeviceId", deviceId)}
            value={settings.defaultSystemAudioDeviceId}
          />
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Microphone input", "麦克风输入")}>
          <DeviceSelect
            ariaLabel={t(lang, "Default microphone input", "默认麦克风输入")}
            devices={audioDevices.filter((device) => device.track === "microphone")}
            fallbackLabel={t(lang, "Default Windows microphone", "默认 Windows 麦克风")}
            onChange={(deviceId) => onControlChange("defaultMicrophoneDeviceId", deviceId)}
            value={settings.defaultMicrophoneDeviceId}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function LanguageSettings({
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
        title={t(lang, "Language", "语言")}
        description={t(lang, "Recognition hints and generated summary language.", "识别提示和生成摘要语言。")}
      />
      <SettingsBlock lang={lang} titleEn="Generated output" titleZh="生成输出">
        <SettingsRow labelText={settingsLabel(lang, "Output mode", "输出模式")}>
          <SegmentedControl
            onChange={(value) =>
              onChange({
                ...settings,
                defaultOutputLanguage: value as LanguageOptionValue
              })
            }
            options={LANGUAGE_OPTIONS.map((option) => ({ label: localizedLanguageOption(option.value, lang), value: option.value }))}
            value={settings.defaultOutputLanguage}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock
        description={t(lang, "These values are passed to the transcription request.", "这些值会传入转写请求。")}
        lang={lang}
        titleEn="Recognition languages"
        titleZh="识别语言"
      >
        <SettingsRow labelText={recognitionLanguageLabel("mandarin", lang)}>
          <Toggle checked={settings.mandarin} labelText={recognitionLanguageLabel("mandarin", lang)} onChange={(checked) => onControlChange("mandarin", checked)} />
        </SettingsRow>
        <SettingsRow labelText={recognitionLanguageLabel("cantonese", lang)}>
          <Toggle checked={settings.cantonese} labelText={recognitionLanguageLabel("cantonese", lang)} onChange={(checked) => onControlChange("cantonese", checked)} />
        </SettingsRow>
        <SettingsRow labelText={recognitionLanguageLabel("englishUS", lang)}>
          <Toggle checked={settings.englishUS} labelText={recognitionLanguageLabel("englishUS", lang)} onChange={(checked) => onControlChange("englishUS", checked)} />
        </SettingsRow>
        <SettingsRow labelText={recognitionLanguageLabel("englishGB", lang)}>
          <Toggle checked={settings.englishGB} labelText={recognitionLanguageLabel("englishGB", lang)} onChange={(checked) => onControlChange("englishGB", checked)} />
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Mixed code-switching", "中英混合切换")}>
          <Toggle
            checked={settings.mixedCodeSwitching}
            labelText={t(lang, "Mixed code-switching", "中英混合切换")}
            onChange={(checked) => onControlChange("mixedCodeSwitching", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function TranscriptionSettings({
  settings,
  onControlChange,
  lang
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
  lang: UiLanguage;
}) {
  return (
    <>
      <SettingsHeader
        title={t(lang, "Transcription & summary", "转写与摘要")}
        description={t(lang, "Cloud processing options used after recording stops.", "录制停止后使用的云端处理选项。")}
      />
      <SettingsBlock lang={lang} titleEn="Transcription" titleZh="转写">
        <SettingsRow
          description={t(
            lang,
            "Keeps transcript segments in the spoken language before summary generation.",
            "生成摘要前，转写片段会保持原始口语语言。"
          )}
          labelText={settingsLabel(lang, "Preserve transcript language", "保留转写原语言")}
        >
          <Toggle
            checked={settings.preserveTranscriptLanguage}
            labelText={t(lang, "Preserve transcript language", "保留转写原语言")}
            onChange={(checked) => onControlChange("preserveTranscriptLanguage", checked)}
          />
        </SettingsRow>
        <SettingsRow
          description={t(
            lang,
            "Attempts to separate speakers after transcription; results depend on audio quality.",
            "转写后尝试区分说话人；效果取决于音频质量。"
          )}
          labelText={settingsLabel(lang, "Identify speakers", "识别说话人")}
        >
          <Toggle
            checked={settings.speakerDiarization}
            labelText={t(lang, "Identify speakers / Speaker diarization", "识别说话人 / Speaker diarization")}
            onChange={(checked) => onControlChange("speakerDiarization", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function ExportSettings({
  settings,
  onControlChange,
  lang
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
  lang: UiLanguage;
}) {
  return (
    <>
      <SettingsHeader
        title={t(lang, "Export defaults", "导出默认值")}
        description={t(lang, "Defaults for the real export dialog.", "真实导出对话框使用的默认值。")}
      />
      <SettingsBlock lang={lang} titleEn="Word and HTML exports" titleZh="Word 与 HTML 导出">
        <SettingsRow labelText={settingsLabel(lang, "Include transcript appendix", "包含转写附录")}>
          <Toggle
            checked={settings.includeTranscriptAppendix}
            labelText={t(lang, "Include transcript appendix", "包含转写附录")}
            onChange={(checked) => onControlChange("includeTranscriptAppendix", checked)}
          />
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Include timestamps", "包含时间戳")}>
          <Toggle
            checked={settings.includeTimestamps}
            labelText={t(lang, "Include timestamps", "包含时间戳")}
            onChange={(checked) => onControlChange("includeTimestamps", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function ApiSettings({ apiStatus, lang }: { apiStatus: SettingsRuntimeStatus | null; lang: UiLanguage }) {
  const openAi = apiStatus?.openAi;
  return (
    <>
      <SettingsHeader
        title={t(lang, "API status", "API 状态")}
        description={t(lang, "Runtime provider configuration detected by the desktop app.", "桌面应用检测到的运行时 provider 配置。")}
      />
      <SettingsBlock lang={lang} titleEn="OpenAI" titleZh="OpenAI">
        <SettingsRow labelText={settingsLabel(lang, "Credentials", "凭据")}>
          <div className="settings-key-status">
            <span className={`status-pill ${openAi?.configured ? "positive" : "warn"}`}>
              {openAi?.configured ? t(lang, "Configured", "已配置") : t(lang, "Not configured", "未配置")}
            </span>
            <span className="settings-note">
              {openAi ? formatOpenAiSource(openAi.source, lang) : t(lang, "Checking runtime status...", "正在检查运行状态...")}
            </span>
            {openAi && !openAi.configured ? (
              <span className="settings-note settings-recovery-note">
                {t(lang, "Set OPENAI_API_KEY in .env or the process environment, then restart MeetMap.", "在 .env 或进程环境变量中设置 OPENAI_API_KEY，然后重启 MeetMap。")}
              </span>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Transcription model", "转写模型")}>
          <ValueText>{openAi?.transcriptionModel ?? "-"}</ValueText>
        </SettingsRow>
        <SettingsRow labelText={settingsLabel(lang, "Summary model", "摘要模型")}>
          <ValueText>{openAi?.structureModel ?? "-"}</ValueText>
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function PrivacySettings({
  settings,
  onControlChange,
  lang
}: {
  settings: AppSettings;
  onControlChange<Key extends SettingsControlKey>(key: Key, value: AppSettings[Key]): void;
  lang: UiLanguage;
}) {
  return (
    <>
      <SettingsHeader
        title={t(lang, "Privacy & upload", "隐私与上传")}
        description={t(lang, "Controls that gate cloud processing.", "控制云端处理是否可用。")}
      />
      <SettingsBlock lang={lang} titleEn="Cloud processing" titleZh="云端处理">
        <SettingsRow
          description={t(
            lang,
            "Applies to future meetings. Valid audio is uploaded after recording stops.",
            "仅影响未来会议。录制停止后会上传有效音频。"
          )}
          labelText={settingsLabel(lang, "Upload recorded audio after meeting ends", "会议结束后上传录音")}
        >
          <Toggle
            checked={settings.uploadRecordedAudio}
            labelText={t(lang, "Upload recorded audio after meeting ends", "会议结束后上传录音")}
            onChange={(checked) => onControlChange("uploadRecordedAudio", checked)}
          />
        </SettingsRow>
      </SettingsBlock>
      <SettingsBlock lang={lang} titleEn="Local files" titleZh="本地文件">
        <SettingsRow labelText={settingsLabel(lang, "Recording folder layout", "录音文件夹结构")}>
          <ValueText>meetings/{"{meetingId}"}/audio</ValueText>
        </SettingsRow>
      </SettingsBlock>
    </>
  );
}

function DeviceSelect({
  ariaLabel,
  devices,
  fallbackLabel,
  onChange,
  value
}: {
  ariaLabel: string;
  devices: RecordingAudioDevice[];
  fallbackLabel: string;
  onChange(value: string | null): void;
  value: string | null;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="select compact"
      onChange={(event) => onChange(event.target.value || null)}
      value={value ?? ""}
    >
      <option value="">{fallbackLabel}</option>
      {devices.map((device) => (
        <option key={device.id} value={device.id}>
          {device.label}
        </option>
      ))}
    </select>
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
  titleEn,
  titleZh,
  description,
  children,
  lang
}: {
  titleEn: string;
  titleZh: string;
  description?: ReactNode;
  children: ReactNode;
  lang: UiLanguage;
}) {
  return (
    <section className="settings-block">
      <div className="settings-block-head">
        <h2 className="h2">{t(lang, titleEn, titleZh)}</h2>
        {description ? <p className="sub">{description}</p> : null}
      </div>
      <div className="settings-block-body">{children}</div>
    </section>
  );
}

function SettingsRow({
  labelText,
  description,
  children
}: {
  labelText: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <div className="settings-row-label">{labelText}</div>
        {description ? <div className="settings-row-description">{description}</div> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
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

function localizedLanguageOption(value: LanguageOptionValue, lang: UiLanguage): string {
  switch (value) {
    case "zh":
      return t(lang, "Chinese", "中文");
    case "en":
      return t(lang, "English", "英文");
    case "bilingual":
      return t(lang, "Bilingual", "中英双语");
  }
}

function recognitionLanguageLabel(
  value: "cantonese" | "englishGB" | "englishUS" | "mandarin",
  lang: UiLanguage
): string {
  switch (value) {
    case "mandarin":
      return t(lang, "Mandarin Chinese (zh-CN)", "普通话中文 (zh-CN)");
    case "cantonese":
      return t(lang, "Cantonese (zh-HK)", "粤语 (zh-HK)");
    case "englishUS":
      return t(lang, "English (en-US)", "英语 (en-US)");
    case "englishGB":
      return t(lang, "English (en-GB)", "英语 (en-GB)");
  }
}

function formatOpenAiSource(source: string, lang: UiLanguage): string {
  switch (source) {
    case ".env or process environment":
      return t(lang, ".env or process environment", ".env 或进程环境变量");
    case "missing OPENAI_API_KEY":
      return t(lang, "missing OPENAI_API_KEY", "缺少 OPENAI_API_KEY");
    default:
      if (source.startsWith("runtime status unavailable:")) {
        return t(
          lang,
          source,
          `运行状态不可用：${source.slice("runtime status unavailable:".length).trim()}`
        );
      }
      return source;
  }
}

function settingsLabel(lang: UiLanguage, en: string, zh: string): ReactNode {
  if (lang !== "bi") {
    return t(lang, en, zh);
  }

  return (
    <span className="settings-label">
      <span className="settings-label-primary">{en}</span>
      <span className="settings-label-secondary">{zh}</span>
    </span>
  );
}

function t(lang: UiLanguage, en: string, zh: string): string {
  return text(lang, en, zh);
}
