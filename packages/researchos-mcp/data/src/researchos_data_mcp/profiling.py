"""data.profile: schema, descriptive statistics, anomaly counts."""

import pandas as pd


def classify(series: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if series.nunique(dropna=True) <= max(20, len(series) // 10):
        return "categorical"
    return "text"


def profile_frame(frame: pd.DataFrame) -> dict:
    schema = []
    stats: dict = {}
    anomalies = []
    for name in frame.columns:
        series = frame[name]
        dtype = classify(series)
        null_count = int(series.isna().sum())
        schema.append(
            {"name": str(name), "dtype": dtype, "null_count": null_count, "unique_count": int(series.nunique(dropna=True))}
        )
        if len(series) > 0 and null_count / len(series) > 0.2:
            anomalies.append(
                {"column": str(name), "kind": "high_null_ratio", "detail": f"{null_count / len(series):.1%} null"}
            )
        if series.nunique(dropna=True) <= 1 and len(series) > 0:
            anomalies.append({"column": str(name), "kind": "constant", "detail": "single distinct value"})
        if dtype == "numeric":
            clean = series.dropna().astype(float)
            if len(clean) > 0:
                q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
                stats[str(name)] = {
                    "mean": float(clean.mean()),
                    "std": float(clean.std(ddof=1)) if len(clean) > 1 else 0.0,
                    "min": float(clean.min()),
                    "p25": q1,
                    "p50": float(clean.median()),
                    "p75": q3,
                    "max": float(clean.max()),
                }
                iqr = q3 - q1
                if iqr > 0:
                    outliers = int(((clean < q1 - 1.5 * iqr) | (clean > q3 + 1.5 * iqr)).sum())
                    if outliers > 0:
                        anomalies.append(
                            {"column": str(name), "kind": "outlier_iqr", "detail": f"{outliers} values outside 1.5*IQR"}
                        )
    duplicated = int(frame.duplicated().sum())
    if duplicated > 0:
        anomalies.append({"column": "*", "kind": "dup_rows", "detail": f"{duplicated} fully duplicated rows"})
    return {"schema": schema, "stats": stats, "anomalies": anomalies}
