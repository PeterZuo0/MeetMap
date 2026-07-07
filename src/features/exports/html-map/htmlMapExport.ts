import type { MeetingStructure } from "../../intelligence/meetingStructure.js";
import { resolveExportOptions, type ExportOptions } from "../exportOptions.js";
import {
  assertValidMeetingGraph,
  buildMeetingGraph,
  enrichMeetingGraph,
  type MeetingGraph
} from "./graphModel.js";

const GRAPH_DATA_TOKEN = "__MEETMAP_GRAPH_JSON__";

export type HtmlMapAudioTrack = {
  label: string;
  mimeType: string;
  dataUrl: string;
};

export function createHtmlMeetingMap(
  structure: MeetingStructure,
  options?: ExportOptions,
  audioTracks: HtmlMapAudioTrack[] = []
): string {
  const resolvedOptions = resolveExportOptions(options);
  const graph = filterGraphForExportOptions(buildMeetingGraph(structure), resolvedOptions);
  return createHtmlMeetingMapFromGraph(
    resolvedOptions.audio && audioTracks.length > 0
      ? { ...graph, audioTracks }
      : graph
  );
}

export function createHtmlMeetingMapFromGraph(graph: MeetingGraph & { audioTracks?: HtmlMapAudioTrack[] }): string {
  assertValidMeetingGraph(graph);
  return HTML_TEMPLATE.replace(GRAPH_DATA_TOKEN, serializeForHtml(graph));
}

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function filterGraphForExportOptions(graph: MeetingGraph, options?: ExportOptions): MeetingGraph {
  const resolvedOptions = resolveExportOptions(options);
  const selectedNodes = graph.nodes
    .filter((node) => {
      if (node.type === "topic" || node.type === "point") {
        return resolvedOptions.map;
      }

      if (node.type === "decision") {
        return resolvedOptions.decisions;
      }

      if (node.type === "action") {
        return resolvedOptions.actions;
      }

      return true;
    })
    .map((node) => {
      if (resolvedOptions.timestamps || node.type !== "meeting" || !node.metadata) {
        return node;
      }

      const metadata = { ...node.metadata };
      delete metadata.startedAt;
      delete metadata.endedAt;
      return { ...node, metadata };
    });
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const nodes = selectedNodes.map((node) => {
      if (!node.parentId || selectedNodeIds.has(node.parentId)) {
        return node;
      }

      const orphanNode = { ...node };
      delete orphanNode.parentId;
      return orphanNode;
    });
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    ...enrichMeetingGraph({
      nodes,
      edges: graph.edges.filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId))
    })
  };
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
        --background: #f8f7f4;
        --surface: #fffefb;
        --surface-strong: #f0efe9;
        --ink: #171717;
        --muted: #6b665d;
        --line: #ddd7cc;
        --accent: #6266e8;
        --meeting: #111827;
        --topic: #6266e8;
        --point: #607089;
        --decision: #12805c;
        --action: #b15c00;
        --question: #8a5a00;
        --risk: #c43b2f;
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

      button,
      input {
        font: inherit;
      }

      .app {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        min-height: 100vh;
      }

      .workspace {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-width: 0;
      }

      .toolbar {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) auto auto;
        align-items: center;
        gap: 12px;
        min-height: 64px;
        padding: 14px 18px;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 254, 251, 0.92);
        backdrop-filter: blur(12px);
      }

      .audio-export {
        display: grid;
        gap: 8px;
        padding: 12px 18px;
        border-bottom: 1px solid var(--line);
        background: var(--surface);
      }

      .audio-export[hidden] {
        display: none;
      }

      .audio-export strong {
        font-size: 12px;
      }

      .audio-export audio {
        width: 100%;
        height: 34px;
      }

      .search {
        width: 100%;
        height: 36px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--ink);
        padding: 0 12px;
      }

      .filters,
      .zoom {
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .chip,
      .icon-button {
        height: 34px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--ink);
        cursor: pointer;
      }

      .chip {
        padding: 0 10px;
        font-size: 12px;
      }

      .chip[aria-pressed="true"] {
        border-color: var(--accent);
        background: #eef2ff;
        color: #3730a3;
      }

      .icon-button {
        width: 34px;
        font-weight: 700;
      }

      .map {
        position: relative;
        min-height: 0;
        overflow: hidden;
      }

      .graph {
        display: block;
        width: 100%;
        height: calc(100vh - 64px);
        min-height: 620px;
        background:
          radial-gradient(circle at center, rgba(98, 102, 232, 0.08), transparent 32%),
          linear-gradient(var(--background), var(--background));
        cursor: grab;
      }

      .graph:active {
        cursor: grabbing;
      }

      .edge {
        fill: none;
        stroke-linecap: round;
        transition: opacity 160ms ease, stroke-width 160ms ease;
      }

      .edge.hierarchy {
        stroke: #a8a198;
      }

      .edge.relation {
        stroke: var(--accent);
      }

      .node {
        cursor: pointer;
        transition: opacity 160ms ease;
      }

      .node circle {
        fill: var(--surface);
        stroke: currentColor;
        stroke-width: 2;
        filter: drop-shadow(0 8px 14px rgba(23, 23, 23, 0.12));
      }

      .node[data-type="meeting"] {
        color: var(--meeting);
      }

      .node[data-type="meeting"] circle {
        fill: var(--meeting);
      }

      .node[data-type="topic"] {
        color: var(--topic);
      }

      .node[data-type="point"] {
        color: var(--point);
      }

      .node[data-type="decision"] {
        color: var(--decision);
      }

      .node[data-type="action"] {
        color: var(--action);
      }

      .node[data-type="question"] {
        color: var(--question);
      }

      .node[data-type="risk"] {
        color: var(--risk);
      }

      .node text {
        fill: var(--ink);
        font-size: 12px;
        font-weight: 700;
        text-anchor: middle;
        pointer-events: none;
      }

      .node[data-type="meeting"] text {
        fill: #ffffff;
      }

      .node .type-label {
        font-size: 10px;
        font-weight: 600;
        opacity: 0.72;
        text-transform: uppercase;
      }

      .node.dimmed,
      .edge.dimmed {
        opacity: 0.14;
      }

      .node.hidden,
      .edge.hidden {
        display: none;
      }

      .node.selected circle {
        stroke-width: 4;
      }

      .empty-state {
        position: absolute;
        inset: 0;
        display: none;
        place-items: center;
        color: var(--muted);
        pointer-events: none;
      }

      .empty-state.visible {
        display: grid;
      }

      .details {
        border-left: 1px solid var(--line);
        background: var(--surface);
        padding: 24px;
        overflow: auto;
      }

      .details h1 {
        margin: 0 0 8px;
        font-size: 20px;
        line-height: 1.2;
      }

      .type {
        display: inline-flex;
        align-items: center;
        height: 24px;
        margin: 0 0 18px;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 10px;
        color: var(--muted);
        font-size: 12px;
        text-transform: capitalize;
      }

      .body {
        margin: 0;
        line-height: 1.6;
      }

      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 8px 12px;
        margin: 22px 0 0;
        font-size: 13px;
      }

      dt {
        color: var(--muted);
      }

      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .related {
        margin-top: 24px;
      }

      .related h2 {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .related button {
        display: block;
        width: 100%;
        margin: 0 0 8px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface-strong);
        color: var(--ink);
        padding: 9px 10px;
        cursor: pointer;
        text-align: left;
      }

      @media (max-width: 980px) {
        .app {
          grid-template-columns: 1fr;
        }

        .toolbar {
          grid-template-columns: 1fr;
          align-items: stretch;
        }

        .filters,
        .zoom {
          flex-wrap: wrap;
        }

        .graph {
          height: 70vh;
        }

        .details {
          border-left: 0;
          border-top: 1px solid var(--line);
          max-height: 44vh;
        }
      }
    </style>
  </head>
  <body>
    <script id="meetmap-graph-data" type="application/json">__MEETMAP_GRAPH_JSON__</script>
    <main class="app" data-layout="force-radial">
      <section class="workspace" aria-label="Meeting map workspace">
        <div class="toolbar">
          <input id="graph-search" class="search" type="search" placeholder="Search nodes..." aria-label="Search graph nodes" />
          <div class="filters" aria-label="Filter node types">
            <button class="chip" type="button" data-filter-type="topic" aria-pressed="true">Topics</button>
            <button class="chip" type="button" data-filter-type="decision" aria-pressed="true">Decisions</button>
            <button class="chip" type="button" data-filter-type="action" aria-pressed="true">Actions</button>
            <button class="chip" type="button" data-filter-type="question" aria-pressed="true">Questions</button>
            <button class="chip" type="button" data-filter-type="risk" aria-pressed="true">Risks</button>
          </div>
          <div class="zoom" aria-label="Zoom controls">
            <button class="icon-button" type="button" data-zoom-action="out" aria-label="Zoom out">-</button>
            <button class="icon-button" type="button" data-zoom-action="reset" aria-label="Reset view">1:1</button>
            <button class="icon-button" type="button" data-zoom-action="in" aria-label="Zoom in">+</button>
          </div>
        </div>
        <div id="audio-export" class="audio-export" hidden></div>
        <div class="map">
          <svg class="graph" id="graph" role="img" aria-label="Force-directed meeting structure map">
            <g id="viewport">
              <g id="edge-layer"></g>
              <g id="node-layer"></g>
            </g>
          </svg>
          <div id="empty-state" class="empty-state">No matching nodes</div>
        </div>
      </section>
      <aside class="details" id="details" aria-live="polite"></aside>
    </main>
    <script>
      const graph = JSON.parse(document.getElementById("meetmap-graph-data").textContent);
      const svg = document.getElementById("graph");
      const viewport = document.getElementById("viewport");
      const edgeLayer = document.getElementById("edge-layer");
      const nodeLayer = document.getElementById("node-layer");
      const details = document.getElementById("details");
      const searchInput = document.getElementById("graph-search");
      const emptyState = document.getElementById("empty-state");
      const audioExport = document.getElementById("audio-export");
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
      const adjacency = buildAdjacency();
      const activeTypes = new Set(["topic", "decision", "action", "question", "risk"]);
      const state = { scale: 1, tx: 0, ty: 0, selectedId: graph.nodes[0]?.id ?? null, query: "" };

      function renderEmbeddedAudio() {
        const tracks = Array.isArray(graph.audioTracks) ? graph.audioTracks : [];
        if (!tracks.length) return;
        audioExport.hidden = false;
        tracks.forEach((track) => {
          const wrapper = document.createElement("div");
          const label = document.createElement("strong");
          label.textContent = track.label;
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = track.dataUrl;
          wrapper.append(label, audio);
          audioExport.appendChild(wrapper);
        });
      }

      function buildAdjacency() {
        const map = new Map(graph.nodes.map((node) => [node.id, new Set()]));
        graph.edges.forEach((edge) => {
          map.get(edge.fromId)?.add(edge.toId);
          map.get(edge.toId)?.add(edge.fromId);
        });
        return map;
      }

      function runForceLayout() {
        const width = Math.max(svg.clientWidth || 1100, 760);
        const height = Math.max(svg.clientHeight || 720, 560);
        const centerX = width / 2;
        const centerY = height / 2;
        const topics = graph.nodes.filter((node) => node.type === "topic");
        const communityIndex = new Map(topics.map((node, index) => [node.id, index]));
        const communityCount = Math.max(topics.length, 1);

        graph.nodes.forEach((node, index) => {
          const radius = node.type === "meeting" ? 0 : node.type === "topic" ? 190 : 290;
          const community = communityIndex.get(node.community) ?? index % communityCount;
          const angle = node.type === "meeting"
            ? 0
            : (Math.PI * 2 * community) / communityCount + (index % 5 - 2) * 0.22;
          node.x = centerX + Math.cos(angle) * radius;
          node.y = centerY + Math.sin(angle) * radius;
          node.vx = 0;
          node.vy = 0;
        });

        for (let step = 0; step < 150; step += 1) {
          applyRepulsion();
          applyEdges();
          applyRadialGravity(centerX, centerY, communityIndex, communityCount);
          graph.nodes.forEach((node) => {
            if (node.type === "meeting") {
              node.x = centerX;
              node.y = centerY;
              node.vx = 0;
              node.vy = 0;
              return;
            }
            node.vx *= 0.72;
            node.vy *= 0.72;
            node.x += node.vx;
            node.y += node.vy;
          });
        }
      }

      function applyRepulsion() {
        for (let i = 0; i < graph.nodes.length; i += 1) {
          for (let j = i + 1; j < graph.nodes.length; j += 1) {
            const a = graph.nodes[i];
            const b = graph.nodes[j];
            const dx = a.x - b.x || 0.01;
            const dy = a.y - b.y || 0.01;
            const distanceSq = Math.max(dx * dx + dy * dy, 1200);
            const force = 1800 / distanceSq;
            a.vx += dx * force;
            a.vy += dy * force;
            b.vx -= dx * force;
            b.vy -= dy * force;
          }
        }
      }

      function applyEdges() {
        graph.edges.forEach((edge) => {
          const from = nodeById.get(edge.fromId);
          const to = nodeById.get(edge.toId);
          if (!from || !to) return;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const target = edge.explicit ? 170 : 130;
          const force = ((distance - target) / distance) * 0.012 * (edge.weight ?? 1);
          const fx = dx * force;
          const fy = dy * force;
          if (from.type !== "meeting") {
            from.vx += fx;
            from.vy += fy;
          }
          if (to.type !== "meeting") {
            to.vx -= fx;
            to.vy -= fy;
          }
        });
      }

      function applyRadialGravity(centerX, centerY, communityIndex, communityCount) {
        graph.nodes.forEach((node, index) => {
          if (node.type === "meeting") return;
          const community = communityIndex.get(node.community) ?? index % communityCount;
          const angle = (Math.PI * 2 * community) / communityCount;
          const radius = node.type === "topic" ? 205 : 315;
          const targetX = centerX + Math.cos(angle) * radius;
          const targetY = centerY + Math.sin(angle) * radius;
          node.vx += (targetX - node.x) * 0.006;
          node.vy += (targetY - node.y) * 0.006;
        });
      }

      function renderGraph() {
        edgeLayer.innerHTML = "";
        nodeLayer.innerHTML = "";
        graph.edges.forEach(renderEdge);
        graph.nodes.forEach(renderNode);
        applyVisibility();
        renderDetails(state.selectedId ? nodeById.get(state.selectedId) : graph.nodes[0]);
      }

      function renderEdge(edge) {
        const from = nodeById.get(edge.fromId);
        const to = nodeById.get(edge.toId);
        if (!from || !to) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const curve = edge.explicit ? 42 : 18;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.max(Math.hypot(dx, dy), 1);
        const normalX = (-dy / length) * curve;
        const normalY = (dx / length) * curve;
        path.setAttribute("d", "M " + from.x + " " + from.y + " Q " + (midX + normalX) + " " + (midY + normalY) + " " + to.x + " " + to.y);
        path.setAttribute("class", "edge " + (edge.explicit ? "relation" : "hierarchy"));
        path.setAttribute("data-edge-id", edge.id);
        path.setAttribute("data-from-id", edge.fromId);
        path.setAttribute("data-to-id", edge.toId);
        path.setAttribute("stroke-width", String((edge.explicit ? 1.6 : 1) + (edge.weight ?? 1) * 0.7));
        path.setAttribute("opacity", edge.explicit ? "0.72" : "0.48");
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = edge.type;
        path.appendChild(title);
        edgeLayer.appendChild(path);
      }

      function renderNode(node) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "node");
        group.setAttribute("tabindex", "0");
        group.setAttribute("role", "button");
        group.setAttribute("data-node-id", node.id);
        group.setAttribute("data-type", node.type);
        group.setAttribute("transform", "translate(" + node.x + " " + node.y + ")");
        group.addEventListener("click", () => selectNode(node.id));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectNode(node.id);
          }
        });
        group.addEventListener("mouseenter", () => highlightNeighborhood(node.id));
        group.addEventListener("mouseleave", () => highlightNeighborhood(null));

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", String(node.radius ?? 18));
        group.appendChild(circle);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("y", node.type === "meeting" ? "4" : "-2");
        label.textContent = compactText(node.type === "meeting" ? node.title : node.body || node.title, node.type === "meeting" ? 18 : 16);
        group.appendChild(label);

        if (node.type !== "meeting") {
          const typeLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
          typeLabel.setAttribute("class", "type-label");
          typeLabel.setAttribute("y", String((node.radius ?? 18) + 17));
          typeLabel.textContent = node.type;
          group.appendChild(typeLabel);
        }

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = node.title + ": " + node.body;
        group.appendChild(title);
        nodeLayer.appendChild(group);
      }

      function compactText(text, maxLength) {
        const value = String(text || "");
        return value.length > maxLength ? value.slice(0, maxLength - 1) + "..." : value;
      }

      function selectNode(nodeId) {
        state.selectedId = nodeId;
        document.querySelectorAll(".node").forEach((element) => {
          element.classList.toggle("selected", element.getAttribute("data-node-id") === nodeId);
        });
        renderDetails(nodeById.get(nodeId));
      }

      function renderDetails(node) {
        details.innerHTML = "";
        if (!node) {
          details.textContent = "No meeting map data.";
          return;
        }
        const heading = document.createElement("h1");
        heading.textContent = node.title;
        const type = document.createElement("p");
        type.className = "type";
        type.textContent = node.type;
        const body = document.createElement("p");
        body.className = "body";
        body.textContent = node.body;
        details.append(heading, type, body);

        const metadata = Object.entries(node.metadata || {});
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

        const relatedIds = Array.from(adjacency.get(node.id) || []);
        if (relatedIds.length > 0) {
          const related = document.createElement("section");
          related.className = "related";
          const relatedHeading = document.createElement("h2");
          relatedHeading.textContent = "Related";
          related.appendChild(relatedHeading);
          relatedIds
            .map((id) => nodeById.get(id))
            .filter(Boolean)
            .forEach((relatedNode) => {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = relatedNode.type + " - " + relatedNode.title;
              button.addEventListener("click", () => selectNode(relatedNode.id));
              related.appendChild(button);
            });
          details.appendChild(related);
        }
      }

      function highlightNeighborhood(nodeId) {
        const neighbors = nodeId ? adjacency.get(nodeId) || new Set() : null;
        document.querySelectorAll(".node").forEach((element) => {
          const id = element.getAttribute("data-node-id");
          const dim = Boolean(nodeId && id !== nodeId && !neighbors.has(id));
          element.classList.toggle("dimmed", dim);
        });
        document.querySelectorAll(".edge").forEach((element) => {
          const dim = Boolean(
            nodeId &&
              element.getAttribute("data-from-id") !== nodeId &&
              element.getAttribute("data-to-id") !== nodeId
          );
          element.classList.toggle("dimmed", dim);
        });
      }

      function applyVisibility() {
        const query = state.query.trim().toLowerCase();
        const visibleIds = new Set();
        graph.nodes.forEach((node) => {
          const typeAllowed = node.type === "meeting" || node.type === "point" || activeTypes.has(node.type);
          const text = (node.title + " " + node.body + " " + node.type).toLowerCase();
          const queryAllowed = !query || text.includes(query);
          if (typeAllowed && queryAllowed) {
            visibleIds.add(node.id);
          }
        });

        document.querySelectorAll(".node").forEach((element) => {
          element.classList.toggle("hidden", !visibleIds.has(element.getAttribute("data-node-id")));
        });
        document.querySelectorAll(".edge").forEach((element) => {
          const fromVisible = visibleIds.has(element.getAttribute("data-from-id"));
          const toVisible = visibleIds.has(element.getAttribute("data-to-id"));
          element.classList.toggle("hidden", !fromVisible || !toVisible);
        });
        emptyState.classList.toggle("visible", visibleIds.size === 0);
      }

      function applyTransform() {
        viewport.setAttribute("transform", "translate(" + state.tx + " " + state.ty + ") scale(" + state.scale + ")");
      }

      document.querySelectorAll("[data-filter-type]").forEach((button) => {
        button.addEventListener("click", () => {
          const type = button.getAttribute("data-filter-type");
          if (activeTypes.has(type)) {
            activeTypes.delete(type);
            button.setAttribute("aria-pressed", "false");
          } else {
            activeTypes.add(type);
            button.setAttribute("aria-pressed", "true");
          }
          applyVisibility();
        });
      });

      searchInput.addEventListener("input", () => {
        state.query = searchInput.value;
        applyVisibility();
      });

      document.querySelectorAll("[data-zoom-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-zoom-action");
          if (action === "in") state.scale = Math.min(2.4, state.scale + 0.18);
          if (action === "out") state.scale = Math.max(0.45, state.scale - 0.18);
          if (action === "reset") {
            state.scale = 1;
            state.tx = 0;
            state.ty = 0;
          }
          applyTransform();
        });
      });

      let drag = null;
      svg.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".node")) return;
        drag = { x: event.clientX, y: event.clientY, tx: state.tx, ty: state.ty };
        svg.setPointerCapture(event.pointerId);
      });
      svg.addEventListener("pointermove", (event) => {
        if (!drag) return;
        state.tx = drag.tx + event.clientX - drag.x;
        state.ty = drag.ty + event.clientY - drag.y;
        applyTransform();
      });
      svg.addEventListener("pointerup", () => {
        drag = null;
      });

      runForceLayout();
      renderEmbeddedAudio();
      renderGraph();
      applyTransform();
      if (state.selectedId) {
        selectNode(state.selectedId);
      }
    </script>
  </body>
</html>`;
