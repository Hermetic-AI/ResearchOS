// Shared Tailwind theme for all ResearchOS v2 pages (mirrors the approved prototypes).
tailwind.config = {
  theme: { extend: {
    colors: {
      paper: '#FAF8F3', card: '#FFFFFF',
      ink: { DEFAULT: '#262521', soft: '#6B6A61', faint: '#9C9B90' },
      line: '#E7E3D8',
      accent: { DEFAULT: '#2F4B7C', soft: '#E8EDF5' },
      seal: '#B3402F', moss: '#5A6E4A', amber: '#A67C2E',
    },
    fontFamily: {
      serif: ['"Noto Serif SC"','"Source Han Serif SC"','"Songti SC"','SimSun','Georgia','serif'],
      sans: ['"Noto Sans SC"','"PingFang SC"','"Microsoft YaHei"','system-ui','sans-serif'],
      mono: ['"JetBrains Mono"','Consolas','monospace'],
    },
  } },
}
