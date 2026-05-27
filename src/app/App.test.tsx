import { render, screen } from "@testing-library/react";

import { App } from "./App";

test("renders the MeetMap workflow setup screen", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Post-meeting workflow" })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Meeting setup")).toBeInTheDocument();
});
