# Shared changes

The `org.matonos.software` package rename is integrated in the `inst-layout`
device-tree worktree: `MatonOSSoftware`, `Software.apk`, its matching privileged
permission XML, app registry row, certificate allowlist key, smoke script and
Software Centre docs are updated there. The signing certificate is unchanged.

No system bridge API or caller certificate change is required. The generic
Flatpak calls and store source API are already available.
