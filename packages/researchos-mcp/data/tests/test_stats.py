import numpy as np
import pandas as pd
import pytest

from researchos_data_mcp.stats import conclude, run_test


def frame_groups() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    a = rng.normal(0.0, 1.0, 40)
    b = rng.normal(3.0, 1.0, 40)
    return pd.DataFrame({"value": np.concatenate([a, b]), "arm": ["a"] * 40 + ["b"] * 40})


def test_ttest_detects_difference_with_effect_size():
    result = run_test(frame_groups(), "ttest", ["value"], {"group_col": "arm"})
    assert result["p_value"] < 0.001
    assert result["effect_name"] == "Cohen's d"
    assert abs(result["effect"]) > 1.0
    conclusion = conclude("ttest", result)
    assert "拒绝原假设" in conclusion
    assert "效应量" in conclusion


def test_mannwhitney_and_pearson():
    frame = pd.DataFrame({"x": range(30), "y": [v * 2 + 1 for v in range(30)]})
    correlation = run_test(frame, "pearson", ["x", "y"], {})
    assert correlation["p_value"] < 0.001
    assert correlation["effect"] == pytest.approx(1.0, abs=1e-6)

    mw = run_test(frame_groups(), "mannwhitney", ["value"], {"group_col": "arm"})
    assert mw["p_value"] < 0.001


def test_chi2_on_categorical():
    frame = pd.DataFrame(
        {"arm": ["a"] * 50 + ["b"] * 50, "outcome": ["win"] * 40 + ["loss"] * 10 + ["win"] * 10 + ["loss"] * 40}
    )
    result = run_test(frame, "chi2", ["arm", "outcome"], {})
    assert result["p_value"] < 0.001
    assert result["effect_name"] == "Cramér's V"


def test_shapiro_and_kruskal():
    normal = pd.DataFrame({"x": np.random.default_rng(3).normal(0, 1, 100)})
    assert run_test(normal, "shapiro", ["x"], {})["p_value"] > 0.01
    kruskal = run_test(frame_groups(), "kruskal", ["value"], {"group_col": "arm"})
    assert kruskal["p_value"] < 0.001


def test_unknown_test_rejected():
    with pytest.raises(ValueError, match="unsupported test"):
        run_test(pd.DataFrame({"x": [1]}), "bogus", ["x"], {})
