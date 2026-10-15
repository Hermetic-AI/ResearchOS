import { JOURNAL_THEMES } from "./spec"

export const JournalThemes = {
  nature: {
    font: "Arial",
    fontSize: 7,
    lineWidth: 0.5,
    palette: ["#E64B35", "#4DBBD5", "#00A087", "#3C5488", "#F39B7F"],
  },
  science: {
    font: "Arial",
    fontSize: 7,
    lineWidth: 0.6,
    palette: ["#0C4B8E", "#BF382A", "#F2AD00", "#7F8C8D", "#27AE60"],
  },
  ieee: {
    font: "Times New Roman",
    fontSize: 8,
    lineWidth: 0.6,
    palette: ["#111111", "#555555", "#888888", "#BBBBBB", "#DDDDDD"],
  },
  prism: {
    font: "Arial",
    fontSize: 8,
    lineWidth: 0.75,
    palette: ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD"],
  },
} as const satisfies Record<(typeof JOURNAL_THEMES)[number], object>
