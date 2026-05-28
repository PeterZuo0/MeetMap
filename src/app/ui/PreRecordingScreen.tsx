import type { LanguageOptionValue } from "../../features/settings/languageOptions";
import { LANGUAGE_OPTIONS } from "../../features/settings/languageOptions";
import type { AudioTrackId, SummaryStyle } from "../../features/meetings/meetingTypes";
import type { ReactNode } from "react";
import type { RecordingAudioDevice, RecordingAudioSources, UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

export function PreRecordingScreen({
  lang,
  title,
  outputLanguage,
  summaryStyle,
  audioSources,
  devices,
  selectedDeviceIds,
  error,
  isStarting,
  onTitleChange,
  onOutputLanguageChange,
  onSummaryStyleChange,
  onAudioSourcesChange,
  onDeviceChange,
  onStart,
  onCancel,
  onOpenPrivacySettings
}: {
  lang: UiLanguage;
  title: string;
  outputLanguage: LanguageOptionValue;
  summaryStyle: SummaryStyle;
  audioSources: RecordingAudioSources;
  devices: RecordingAudioDevice[];
  selectedDeviceIds: Partial<Record<AudioTrackId, string>>;
  error: string | null;
  isStarting: boolean;
  onTitleChange(title: string): void;
  onOutputLanguageChange(language: LanguageOptionValue): void;
  onSummaryStyleChange(summaryStyle: SummaryStyle): void;
  onAudioSourcesChange(sources: RecordingAudioSources): void;
  onDeviceChange(track: AudioTrackId, deviceId: string): void;
  onStart(): void;
  onCancel(): void;
  onOpenPrivacySettings(): void;
}) {
  const canStart = audioSources.system || audioSources.microphone;
  const sourceStatus = getSourceStatus(audioSources);

  function updateSource(track: keyof RecordingAudioSources, enabled: boolean) {
    onAudioSourcesChange({ ...audioSources, [track]: enabled });
  }

  return (
    <section className="pane pre-recording-pane" aria-label="Pre-recording setup">
      <div className="pre-recording-head">
        <div>
          <h1 className="h1">{label(lang, "Set up your recording", "设置录制")}</h1>
          <p className="sub">
            {label(
              lang,
              "MeetMap captures system audio and your microphone as two separate tracks. Processing happens after the meeting ends.",
              "MeetMap 会把系统声音和麦克风作为两条独立轨道录制，会议结束后再处理。"
            )}
          </p>
        </div>
        <div className="pre-recording-actions">
          <button className="btn" onClick={onCancel} type="button">
            {label(lang, "Cancel", "取消")}
          </button>
          <button className="btn primary" disabled={isStarting || !canStart} onClick={onStart} type="button">
            <Icon name="record" size={14} />
            {isStarting ? label(lang, "Starting...", "正在开始...") : label(lang, "Start recording", "开始录制")}
          </button>
        </div>
      </div>

      <div className="pre-recording-form">
        {error ? <div className="error-box">{error}</div> : null}
        <label className="field">
          Title (optional)
          <input
            aria-label="Meeting title"
            className="input"
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Untitled meeting"
            value={title}
          />
        </label>
        <label className="field">
          Folder
          <select className="select" defaultValue="Product weekly">
            <option>Product weekly</option>
            <option>1:1s</option>
            <option>Client calls</option>
          </select>
        </label>
      </div>

      <div className="pre-section-head">
        <div>
          <h2 className="h2">Audio sources</h2>
          <p className="sub">Each track is detected and transcribed independently.</p>
        </div>
        <span className={`status-pill ${sourceStatus.tone}`}>{sourceStatus.label}</span>
      </div>

      <div className="pre-audio-grid">
        <AudioSourceCard
          enabled={audioSources.system}
          icon="monitor"
          level={audioSources.system ? 0.62 : 0}
          onToggle={(enabled) => updateSource("system", enabled)}
          source="Meeting · Zoom · 会议室 03"
          subtitle="What you hear on this PC"
          title="System audio"
          deviceFallback="Default — Realtek HD Audio"
          devices={devices.filter((device) => device.track === "system")}
          hint="Captured via WASAPI loopback. No virtual cable required."
          onDeviceChange={(deviceId) => onDeviceChange("system", deviceId)}
          selectedDeviceId={selectedDeviceIds.system}
        />
        <AudioSourceCard
          accent
          enabled={audioSources.microphone}
          icon="mic"
          level={audioSources.microphone ? 0.34 : 0}
          onToggle={(enabled) => updateSource("microphone", enabled)}
          subtitle="What you say"
          title="Microphone"
          deviceFallback="Shure MV7 · USB"
          devices={devices.filter((device) => device.track === "microphone")}
          hint="Speak now to check input level. Push-to-talk disabled."
          onDeviceChange={(deviceId) => onDeviceChange("microphone", deviceId)}
          selectedDeviceId={selectedDeviceIds.microphone}
        />
      </div>

      {!canStart ? (
        <div className="error-box pre-recording-warning">No audio source selected. Enable system audio or microphone to start recording.</div>
      ) : null}

      <h2 className="h2 pre-block-title">Language & processing</h2>
      <div className="pre-settings-card">
        <PreSettingsRow labelText="Meeting language (auto-detected)">
          <div className="inline-options">
            <span className="chip">中 / EN</span>
            <span className="sub">Confidence 96% · will adapt during meeting</span>
          </div>
        </PreSettingsRow>
        <PreSettingsRow labelText="Output language">
          <SegmentedControl
            onChange={(value) => onOutputLanguageChange(value as LanguageOptionValue)}
            options={LANGUAGE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            value={outputLanguage}
          />
        </PreSettingsRow>
        <PreSettingsRow labelText="Transcription model">
          <div className="inline-options">
            <Icon name="spark" size={14} style={{ color: "var(--accent)" }} />
            <span>MeetMap Cloud · Premium</span>
            <span className="chip">≈ 0.4c / minute</span>
          </div>
        </PreSettingsRow>
        <PreSettingsRow labelText="Summary style" last>
          <div className="inline-options wrap">
            {SUMMARY_STYLE_OPTIONS.map((option) => (
              <button
                className={`btn small ${summaryStyle === option.value ? "soft-active" : ""}`}
                key={option.value}
                onClick={() => onSummaryStyleChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </PreSettingsRow>
      </div>

      <div className="privacy-strip">
        <Icon name="settings" size={16} style={{ color: "var(--positive)" }} />
        <span>
          Recording stays on your PC. Cloud APIs only receive audio after you stop and process, and only for the tracks you keep.
        </span>
        <button className="link-button" onClick={onOpenPrivacySettings} type="button">Privacy settings</button>
      </div>
    </section>
  );
}

const SUMMARY_STYLE_OPTIONS: Array<{ label: string; value: SummaryStyle }> = [
  { label: "Decisions & actions", value: "decisions_actions" },
  { label: "Topic outline", value: "topic_outline" },
  { label: "Q&A", value: "qa" },
  { label: "Highlights", value: "highlights" }
];

function getSourceStatus(audioSources: RecordingAudioSources): { label: string; tone: "positive" | "warn" | "danger" } {
  if (audioSources.system && audioSources.microphone) {
    return { label: "Both detected", tone: "positive" };
  }

  if (audioSources.system) {
    return { label: "System audio only", tone: "warn" };
  }

  if (audioSources.microphone) {
    return { label: "Microphone only", tone: "warn" };
  }

  return { label: "No sources selected", tone: "danger" };
}

function AudioSourceCard({
  icon,
  title,
  subtitle,
  deviceFallback,
  devices,
  selectedDeviceId,
  hint,
  source,
  level,
  enabled,
  accent = false,
  onToggle,
  onDeviceChange
}: {
  icon: "monitor" | "mic";
  title: string;
  subtitle: string;
  deviceFallback: string;
  devices: RecordingAudioDevice[];
  selectedDeviceId?: string;
  hint: string;
  source?: string;
  level: number;
  enabled: boolean;
  accent?: boolean;
  onToggle(enabled: boolean): void;
  onDeviceChange(deviceId: string): void;
}) {
  const deviceValue = selectedDeviceId ?? devices[0]?.id ?? "default";

  return (
    <div className={`pre-audio-card ${enabled ? "" : "disabled"}`}>
      <div className="pre-audio-title">
        <div className={`pre-audio-icon ${accent ? "accent" : ""}`}>
          <Icon name={icon} size={18} />
        </div>
        <div>
          <div className="pre-audio-name">
            <span>{title}</span>
            <span className={`chip ${enabled ? "dot ok" : ""}`}>{enabled ? "Detected" : "Off"}</span>
          </div>
          <div className="sub">{subtitle}</div>
        </div>
        <button
          aria-checked={enabled}
          aria-label={title}
          className={`toggle-button ${enabled ? "checked" : ""}`}
          onClick={() => onToggle(!enabled)}
          role="switch"
          type="button"
        >
          <span />
        </button>
      </div>
      <label className="device-select">
        <span>Device</span>
        <select
          aria-label={`${title} device`}
          onChange={(event) => onDeviceChange(event.target.value)}
          value={deviceValue}
        >
          {devices.length > 0 ? (
            devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))
          ) : (
            <option value="default">{deviceFallback}</option>
          )}
        </select>
      </label>
      <div className="input-level-label">
        <span>Input level</span>
        <span>{Math.round(level * 100)}%</span>
      </div>
      <LevelMeter level={level} />
      {source ? <div className="source-pill">{source}</div> : null}
      <p className="sub">{hint}</p>
    </div>
  );
}

function LevelMeter({ level }: { level: number }) {
  const activeBars = Math.round(level * 28);
  return (
    <div className="pre-level-meter" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span className={index < activeBars ? "active" : ""} key={index} />
      ))}
    </div>
  );
}

function PreSettingsRow({
  labelText,
  children,
  last = false
}: {
  labelText: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`pre-settings-row ${last ? "last" : ""}`}>
      <div>{labelText}</div>
      <div>{children}</div>
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
