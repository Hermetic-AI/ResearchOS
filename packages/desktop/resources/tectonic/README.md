# Tectonic desktop resource

Release packaging places the platform binary at `tectonic/<platform>-<arch>/tectonic[.exe]`.
The desktop sidecar exports that exact packaged path as `RESEARCHOS_TECTONIC`; development builds continue to use PATH or an explicit environment override.

Supported directory names are `win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, and `linux-arm64`. CI must verify the upstream checksum before placing a binary here; binaries and credentials are intentionally not committed to source control.
