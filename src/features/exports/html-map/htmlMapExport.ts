import type { MeetingStructure } from "../../intelligence/meetingStructure";
import { buildMeetingGraph, type MeetingGraph } from "./graphModel";

const GRAPH_DATA_TOKEN = "__MEETMAP_GRAPH_JSON__";

export function createHtmlMeetingMap(structure: MeetingStructure): string {
  return createHtmlMeetingMapFromGraph(buildMeetingGraph(structure));
}

export function createHtmlMeetingMapFromGraph(graph: MeetingGraph): string {
  return HTML_TEMPLATE.replace(GRAPH_DATA_TOKEN, serializeForHtml(graph));
}

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const HTML_TEMPLATE = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MeetMap HTML Map</title>
    <style>
      :root {
        color-scheme: light;
        --background: #f8fafc;
        --surface: #ffffff;
        --ink: #111827;
        --muted: #64748b;
        --line: #cbd5e1;
        --hierarchy: #94a3b8;
        --relation: #f97316;
        --meeting: #2563eb;
        --topic: #0f766e;
        --point: #475569;
        --decision: #7c3aed;
        --action: #15803d;
        --question: #ca8a04;
        --risk: #dc2626;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--background);
        color: var(--ink);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .app {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        min-height: 100vh;
      }

      .map {
        position: relative;
        min-height: 100vh;
        overflow: auto;
        padding: 40px;
      }

      .canvas {
        position: relative;
        min-width: 980px;
        min-height: 720px;
      }

      .edge-layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .edge {
        fill: none;
        stroke-linecap: round;
      }

      .edge.hierarchy {
        stroke: var(--hierarchy);
        stroke-width: 2;
      }

      .edge.relation {
        stroke: var(--relation);
        stroke-width: 2.5;
        stroke-dasharray: 8 7;
      }

      .node {
        position: absolute;
        width: 190px;
        min-height: 72px;
        border: 1px solid var(--line);
        border-left: 6px solid var(--point);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        color: var(--ink);
        cursor: pointer;
        padding: 12px;
        text-align: left;
      }

      .node:hover,
      .node:focus {
        outline: 3px solid rgba(37, 99, 235, 0.22);
      }

      .node[data-type="meeting"] {
        border-left-color: var(--meeting);
        width: 230px;
      }

      .node[data-type="topic"] {
        border-left-color: var(--topic);
      }

      .node[data-type="decision"] {
        border-left-color: var(--decision);
      }

      .node[data-type="action"] {
        border-left-color: var(--action);
      }

      .node[data-type="question"] {
        border-left-color: var(--question);
      }

      .node[data-type="risk"] {
        border-left-color: var(--risk);
      }

      .node-title {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .node-body {
        display: -webkit-box;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.4;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }

      .details {
        border-left: 1px solid var(--line);
        background: var(--surface);
        padding: 28px;
      }

      .details h1 {
        margin: 0 0 6px;
        font-size: 20px;
      }

      .type {
        margin: 0 0 18px;
        color: var(--muted);
        font-size: 13px;
        text-transform: capitalize;
      }

      .body {
        line-height: 1.55;
      }

      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 8px 12px;
        margin-top: 22px;
        font-size: 13px;
      }

      dt {
        color: var(--muted);
      }

      dd {
        margin: 0;
      }

      @media (max-width: 900px) {
        .app {
          grid-template-columns: 1fr;
        }

        .map {
          min-height: 70vh;
          padding: 20px;
        }

        .details {
          border-left: 0;
          border-top: 1px solid var(--line);
        }
      }
    </style>
  </head>
  <body>
    <script id="meetmap-graph-data" type="application/json">__MEETMAP_GRAPH_JSON__</script>
    <main class="app">
      <section class="map" aria-label="Meeting map">
        <div class="canvas" id="canvas">
          <svg class="edge-layer" id="edge-layer" aria-hidden="true"></svg>
        </div>
      </section>
      <aside class="details" id="details" aria-live="polite"></aside>
    </main>
    <script>
      const graph = JSON.parse(document.getElementById("meetmap-graph-data").textContent);
      const canvas = document.getElementById("canvas");
      const edgeLayer = document.getElementById("edge-layer");
      const details = document.getElementById("details");
      const positions = new Map();
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

      function layout() {
        const meeting = graph.nodes.find((node) => node.type === "meeting");
        const topics = graph.nodes.filter((node) => node.type === "topic");
        const centerX = 490;
        const centerY = 320;

        if (meeting) {
          positions.set(meeting.id, { x: centerX - 115, y: centerY - 40, width: 230, height: 92 });
        }

        topics.forEach((topic, index) => {
          const side = index % 2 === 0 ? -1 : 1;
          const rank = Math.floor(index / 2);
          const topicX = centerX + side * 310 - 95;
          const topicY = 120 + rank * 230;
          positions.set(topic.id, { x: topicX, y: topicY, width: 190, height: 88 });

          const children = graph.nodes.filter((node) => node.parentId === topic.id);
          children.forEach((child, childIndex) => {
            positions.set(child.id, {
              x: topicX + side * 210,
              y: topicY + childIndex * 102,
              width: 190,
              height: 82
            });
          });
        });

        const orphans = graph.nodes.filter(
          (node) => node.type !== "meeting" && node.type !== "topic" && !node.parentId
        );
        orphans.forEach((node, index) => {
          positions.set(node.id, { x: centerX - 95, y: 520 + index * 102, width: 190, height: 82 });
        });
      }

      function renderNodes() {
        graph.nodes.forEach((node) => {
          const position = positions.get(node.id);
          if (!position) return;
          const button = document.createElement("button");
          button.className = "node";
          button.dataset.type = node.type;
          button.style.left = position.x + "px";
          button.style.top = position.y + "px";
          button.style.width = position.width + "px";
          button.innerHTML =
            '<span class="node-title"></span><span class="node-body"></span>';
          button.querySelector(".node-title").textContent = node.title;
          button.querySelector(".node-body").textContent = node.body;
          button.addEventListener("click", () => renderDetails(node));
          canvas.appendChild(button);
        });
      }

      function renderEdges() {
        edgeLayer.setAttribute("viewBox", "0 0 " + canvas.scrollWidth + " " + canvas.scrollHeight);
        graph.edges.forEach((edge) => {
          const from = positions.get(edge.fromId);
          const to = positions.get(edge.toId);
          if (!from || !to) return;
          const fromX = from.x + from.width / 2;
          const fromY = from.y + from.height / 2;
          const toX = to.x + to.width / 2;
          const toY = to.y + to.height / 2;
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const midX = (fromX + toX) / 2;
          path.setAttribute("d", "M " + fromX + " " + fromY + " C " + midX + " " + fromY + ", " + midX + " " + toY + ", " + toX + " " + toY);
          path.setAttribute("class", "edge " + (edge.explicit ? "relation" : "hierarchy"));
          path.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title")).textContent = edge.type;
          edgeLayer.appendChild(path);
        });
      }

      function renderDetails(node) {
        const metadata = Object.entries(node.metadata || {});
        details.innerHTML = "";
        const heading = document.createElement("h1");
        heading.textContent = node.title;
        const type = document.createElement("p");
        type.className = "type";
        type.textContent = node.type;
        const body = document.createElement("p");
        body.className = "body";
        body.textContent = node.body;
        details.append(heading, type, body);

        if (metadata.length > 0) {
          const list = document.createElement("dl");
          metadata.forEach(([key, value]) => {
            const term = document.createElement("dt");
            term.textContent = key;
            const detail = document.createElement("dd");
            detail.textContent = value;
            list.append(term, detail);
          });
          details.appendChild(list);
        }
      }

      layout();
      renderEdges();
      renderNodes();
      renderDetails(nodeById.get(graph.nodes[0].id));
    </script>
  </body>
</html>`;
