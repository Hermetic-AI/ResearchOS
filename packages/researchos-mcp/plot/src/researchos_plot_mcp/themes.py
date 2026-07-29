THEMES = {
    "nature": {
        "font.family": "sans-serif",
        "font.size": 7,
        "axes.linewidth": 0.5,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "xtick.direction": "out",
        "ytick.direction": "out",
        "figure.figsize": (3.5, 2.7),
    },
    "science": {
        "font.family": "sans-serif",
        "font.size": 7,
        "axes.linewidth": 0.6,
        "axes.grid": False,
        "xtick.direction": "out",
        "ytick.direction": "out",
        "figure.figsize": (3.5, 2.6),
    },
    "ieee": {
        "font.family": "serif",
        "font.size": 8,
        "axes.linewidth": 0.6,
        "axes.prop_cycle": __import__("cycler").cycler(
            color=["#111111", "#555555", "#888888", "#BBBBBB"]
        ),
        "figure.figsize": (3.5, 2.3),
    },
    "prism": {
        "font.family": "sans-serif",
        "font.size": 8,
        "axes.linewidth": 0.75,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "figure.figsize": (4.0, 3.0),
    },
}

PALETTES = {
    "nature": ["#E64B35", "#4DBBD5", "#00A087", "#3C5488", "#F39B7F"],
    "science": ["#0C4B8E", "#BF382A", "#F2AD00", "#7F8C8D", "#27AE60"],
    "ieee": ["#111111", "#555555", "#888888", "#BBBBBB", "#DDDDDD"],
    "prism": ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD"],
}
