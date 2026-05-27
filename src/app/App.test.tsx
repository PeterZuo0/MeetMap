import { render, screen } from "@testing-library/react";

import { App } from "./App";

test("renders the MeetMap MVP placeholder", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "MeetMap" })).toBeInTheDocument();
  expect(screen.getByText("MVP scaffold active")).toBeInTheDocument();
});
