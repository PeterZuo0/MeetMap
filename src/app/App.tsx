import { routes } from "./routes";

export function App() {
  const [homeRoute] = routes;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f7f8fb",
        color: "#1d2433",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
      }}
    >
      <section
        aria-label={homeRoute.label}
        style={{
          width: "min(560px, calc(100vw - 48px))",
          padding: "40px",
          border: "1px solid #d9dfeb",
          borderRadius: "8px",
          background: "#ffffff",
          boxShadow: "0 18px 50px rgba(29, 36, 51, 0.08)"
        }}
      >
        <p
          style={{
            margin: "0 0 12px",
            color: "#3766d5",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "0"
          }}
        >
          MVP scaffold active
        </p>
        <h1
          style={{
            margin: "0 0 16px",
            fontSize: "44px",
            lineHeight: 1.05,
            letterSpacing: "0"
          }}
        >
          MeetMap
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "460px",
            color: "#536073",
            fontSize: "17px",
            lineHeight: 1.6
          }}
        >
          Desktop meeting assistant scaffold for capture, transcription,
          structured summaries, and visual meeting maps.
        </p>
      </section>
    </main>
  );
}
