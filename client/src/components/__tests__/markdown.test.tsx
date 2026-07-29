import "../../test/setup";
import { render, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "../markdown";

const mermaidMock = {
  initialize: vi.fn(),
  run: vi.fn(() => Promise.resolve()),
};

vi.mock("mermaid", () => ({
  default: {
    initialize: (...args: Parameters<typeof mermaidMock.initialize>) =>
      mermaidMock.initialize(...args),
    run: (...args: Parameters<typeof mermaidMock.run>) =>
      mermaidMock.run(...args),
  },
}));
beforeEach(() => {
  mermaidMock.initialize.mockClear();
  mermaidMock.run.mockClear();
});

const edgeNetworkDiagram = `graph TD
    classDef edge fill:#99ccff,stroke:#0066cc,stroke-width:2px;
    classDef db fill:#ffcc99,stroke:#cc6600,stroke-width:2px;
    classDef user fill:#f9f9f9,stroke:#333,stroke-width:1px;

    U1[User - Tokyo]:::user -->|< 20ms| E1((Edge Node<br/>Tokyo)):::edge
    U2[User - London]:::user -->|< 20ms| E2((Edge Node<br/>London)):::edge
    E1 -.-|Background Sync| DB[(Core Database<br/>Primary Region)]:::db
    E2 -.-|Background Sync| DB`;

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

  it("renders standalone Mermaid blocks between prose as diagrams", async () => {
    const { container } = render(<Markdown content={`Before the chart.

${mermaidDiagram}

The Challenges of the Traditional Model

${edgeNetworkDiagram}

After the chart.`} />);
    const mermaidBlocks = container.querySelectorAll("pre.mermaid_default, pre.mermaid_dark");

    expect(mermaidBlocks).toHaveLength(4);
    expect(mermaidBlocks[0]).toHaveTextContent("Central Server<br/>New York");
    expect(mermaidBlocks[1]).toHaveTextContent("Central Server<br/>New York");
    expect(mermaidBlocks[2]).toHaveTextContent("Edge Node<br/>Tokyo");
    expect(mermaidBlocks[2]).toHaveTextContent("|< 20ms|");
    expect(mermaidBlocks[2]).not.toHaveTextContent("The Challenges of the Traditional Model");

    await waitFor(() => {
      expect(mermaidMock.run).toHaveBeenCalledTimes(2);
    });
    expect(container).toHaveTextContent("Before the chart.");
    expect(container).toHaveTextContent("The Challenges of the Traditional Model");
    expect(container).toHaveTextContent("After the chart.");
  });
});
