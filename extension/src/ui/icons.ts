export type CardIcon = "message" | "scales" | "shield" | "lawyer" | "search";

/** Local vector assets: no font glyphs, emoji, runtime libraries or network assets. */
export function cardIcon(document: Document, kind: CardIcon): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("class", "card-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const paths: Record<CardIcon, string[]> = {
    message: [
      "M12 3C6.5 3 2 6.6 2 11c0 2.3 1.2 4.4 3.2 5.9L4 22l5.2-3.3c.9.2 1.8.3 2.8.3 5.5 0 10-3.6 10-8S17.5 3 12 3Z",
    ],
    scales: [
      "M12 3v18M7 21h10M3 7h18M6 7l-4 7h8L6 7ZM18 7l-4 7h8l-4-7ZM2 14c0 2 8 2 8 0M14 14c0 2 8 2 8 0",
    ],
    shield: ["M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z", "m8 12 3 3 5-6"],
    lawyer: [
      "M9 3h6v2H9z",
      "M9 5v2a3 3 0 0 0 6 0V5",
      "M5 22v-5a7 7 0 0 1 14 0v5H5Z",
      "m9 11 3 5 3-5M12 16v6M8 17v5M16 17v5",
    ],
    search: ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z", "m15 15 6 6"],
  };
  for (const d of paths[kind]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    if (kind === "message") {
      path.setAttribute("fill", "currentColor");
      path.setAttribute("stroke", "none");
    }
    svg.append(path);
  }
  if (kind === "message")
    for (const x of [7, 12, 17]) {
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", "11");
      dot.setAttribute("r", "1");
      dot.setAttribute("fill", "#ffffff");
      dot.setAttribute("stroke", "none");
      svg.append(dot);
    }
  return svg;
}
