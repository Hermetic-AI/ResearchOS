import pandas as pd

from researchos_data_mcp.profiling import profile_frame


def test_profile_schema_stats_and_anomalies():
    frame = pd.DataFrame(
        {
            "score": [1.0, 2.0, 3.0, 4.0, 100.0],
            "group": ["a", "a", "b", "b", "b"],
            "constant": [7, 7, 7, 7, 7],
            "sparse": [1.0, None, None, None, None],
        }
    )
    frame = pd.concat([frame, frame.iloc[[0]]], ignore_index=True)
    result = profile_frame(frame)

    schema = {column["name"]: column for column in result["schema"]}
    assert schema["score"]["dtype"] == "numeric"
    assert schema["group"]["dtype"] == "categorical"
    assert schema["sparse"]["null_count"] == 4

    assert result["stats"]["score"]["max"] == 100.0
    assert result["stats"]["score"]["p50"] == 2.5

    kinds = {anomaly["kind"] for anomaly in result["anomalies"]}
    assert "outlier_iqr" in kinds
    assert "constant" in kinds
    assert "high_null_ratio" in kinds
    assert "dup_rows" in kinds
