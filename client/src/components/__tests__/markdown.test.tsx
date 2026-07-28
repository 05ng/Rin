import "../../test/setup";
import { render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../markdown";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  run: vi.fn(() => Promise.resolve()),
}));

vi.mock("mermaid", () => ({
  default: mermaidMock,
}));

const mermaidDiagram = `graph TD
    classDef server fill:#ff9999,stroke:#cc0000,stroke-width:2px;
    classDef user fill:#f9f9f9,stroke:#333,stroke-width:1px;

    U1[User - Tokyo]:::user -->|High Latency| S((Central Server<br/>New York)):::server
    U2[User - London]:::user -->|Medium Latency| S
    U3[User - New York]:::user -->|Low Latency| S
    U4[User - Sydney]:::user -->|Very High Latency| S`;

describe("Markdown Mermaid rendering", () => {
  it("renders fenced Mermaid blocks as Mermaid source nodes", async () => {
    const { container } = render(<Markdown content={`\`\`\`mermaid
${mermaidDiagram}
\`\`\``} />);
    const mermaidBlocks = container.querySelectorAll("pre.mermaid_default, pre.mermaid_dark");

    expect(mermaidBlocks).toHaveLength(2);
    expect(mermaidBlocks[0]).toHaveTextContent("graph TD");
    expect(mermaidBlocks[0]).toHaveTextContent("Central Server<br/>New York");
    expect(within(mermaidBlocks[0] as HTMLElement).queryByText("New York")).toBeNull();

    await waitFor(() => {
      expect(mermaidMock.run).toHaveBeenCalledTimes(2);
    });
    expect(mermaidMock.initialize).toHaveBeenCalledWith({ startOnLoad: false, theme: "default" });
    expect(mermaidMock.initialize).toHaveBeenCalledWith({ startOnLoad: false, theme: "dark" });
  });
});
