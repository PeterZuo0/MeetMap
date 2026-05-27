import type { LanguageOptionValue } from "../../features/settings/languageOptions";
import { LANGUAGE_OPTIONS } from "../../features/settings/languageOptions";
import type { ReactNode } from "react";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

export function PreRecordingScreen({
  lang,
  title,
  outputLanguage,
  error,
  isStarting,
  onTitleChange,
  onOutputLanguageChange,
  onStart,
  onCancel
}: {
  lang: UiLanguage;
  title: string;
  outputLanguage: LanguageOptionValue;
  error: string | null;
  isStarting: boolean;
  onTitleChange(title: string): void;
  onOutputLanguageChange(language: LanguageOptionValue): void;
  onStart(): void;
  onCancel(): void;
}) {
  return (
    <section className="pane" aria-label="Pre-recording setup">
      <div className="screen-head">
        <div>
          <h1 className="h1">{label(lang, "Prepare recording", "准备录制")}</h1>
          <p className="sub">{label(lang, "Choose the meeting title and summary language before capture starts.", "开始录制前选择会议标题和总结语言。")}</p>
        </div>
        <button className="btn" onClick={onCancel} type="button">
          {label(lang, "Cancel", "取消")}
        </button>
      </div>

      <div className="form-grid">
        <div className="form-card">
          {error ? <div className="error-box">{error}</div> : null}
          <label className="field">
            Meeting title
            <input
              className="input"
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Untitled meeting"
              value={title}
            />
          </label>
          <label className="field">
            Output language
            <select
              className="select"
              onChange={(event) =>
                onOutputLanguageChange(event.target.value as LanguageOptionValue)
              }
              value={outputLanguage}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary" disabled={isStarting} onClick={onStart} type="button">
            <Icon name="record" size={14} />
            {isStarting ? label(lang, "Starting...", "正在开始...") : label(lang, "Start recording", "开始录制")}
          </button>
        </div>

        <div className="audio-card">
          <AudioSource
            icon="monitor"
            title={label(lang, "System audio", "系统音频")}
            sub={label(lang, "Desktop meeting audio will be captured by the active provider.", "桌面会议音频将由当前录音 provider 捕获。")}
            level={14}
          />
          <AudioSource
            icon="mic"
            title={label(lang, "Microphone", "麦克风")}
            sub={label(lang, "Local microphone is recorded as a separate track.", "本地麦克风会作为独立轨道录制。")}
            level={11}
          />
        </div>
      </div>
    </section>
  );
}

function AudioSource({
  icon,
  title,
  sub,
  level
}: {
  icon: "monitor" | "mic";
  title: ReactNode;
  sub: ReactNode;
  level: number;
}) {
  return (
    <div className="audio-source">
      <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
        <Icon name={icon} size={18} style={{ color: "var(--accent)" }} />
        <div>
          <div className="h2">{title}</div>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <div className="level-bars" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span
            className={index < level ? "active" : ""}
            key={index}
            style={{ height: 6 + ((index % 7) + 1) * 2 }}
          />
        ))}
      </div>
    </div>
  );
}
