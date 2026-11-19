> v3.5: linuxd is retired. Any linuxd/shared-store paths below describe the
> historical design. See [current ownership and device checks](../../docs/RETIRE-LINUXD.md).

# Software Center (`org.matonos.software`) — source plugins

Browse collections, search, details and ratings come from enabled backend
plugins. The Flatpak plugin supplies Flathub's Popular/New collections and
ODRS ratings; the F-Droid plugin supplies New and a 0–10 Popular heuristic
from its cached index. F-Droid has no download counts, so its score combines
a curated known-app signal, version history, catalogue age, update freshness
and anti-feature penalties. Equal scores are merged round-robin across
enabled sources, so source order cannot crowd out other catalogues. The store has no built-in Flathub source. Enabled
backend apps are loaded through `SourcePlugins` and wrapped by `PluginSource`, using the contract in
[SOURCE-PLUGINS.md](contract/SOURCE-PLUGINS.md). System plugins start enabled; the
Sources controls can toggle them and refresh the session source registry.
Only plugins advertising `HAS_REPOSITORIES` get repository management.

F-Droid now lives in the separate Java app
[`store-sources/fdroid`](../../store-sources/fdroid/README.md). It owns trusted
repository preferences, authenticated indices, compatible version selection,
safety mapping and verified APK downloads. The store owns PackageInstaller
sessions and uninstall. `SourceInstallReceiver` handles generic uninstall
results; commit results are relayed directly to each plugin.

Checks: `npx tsc --noEmit`, `npx eslint src`, and the release app build
through `tools/build-apps.sh` (`MATON_APPS_ONLY=matonos-software`). The moved
index-client host test is `store-sources/fdroid/test-host.sh`. Fresh-image
runtime checks and known limitations are in the plugin README.

Material Symbols are rasterized from Expo's bundled Material Symbols font.
`expo-symbols` and `expo-font` are direct dependencies so release bundling
includes the font instead of depending on transitive package discovery. The
search field uses the native placeholder slot so “Search apps” stays visible
while empty. The navigation uses an icon-and-label rail with an indicator
behind the selected icon.

## Building
Standalone: clone with `--recurse-submodules` (the plugin contract lives in the
`contract/` submodule). In MatonOS it is checked out as `rn-apps/flathub` in the
device tree and built by its `tools/build-apps.sh`.
