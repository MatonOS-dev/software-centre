> v3.5: linuxd is retired. Any linuxd/shared-store paths below describe the
> historical design. See [current ownership and device checks](../../docs/RETIRE-LINUXD.md).

# Software Center (`org.matonos.software`) — source plugins

Browse collections and search results come from enabled backend plugins. The store
fetches and submits every rating through one source-neutral service at
`https://maton.hanro50.net.za/api`; plugins never own or emit ratings. Popular
scores remain plugin supplied. The Flatpak plugin supplies Flathub's
Popular/New collections; F-Droid supplies New and a 0–10 score based on shared
server download counts. Equal scores are merged round-robin across enabled
sources, so source order cannot crowd out other catalogues. The store has no
built-in Flathub source. Enabled backend apps are loaded through `SourcePlugins`
and wrapped by `PluginSource`, using the contract in
[SOURCE-PLUGINS.md](contract/SOURCE-PLUGINS.md). System plugins start enabled;
the Sources controls can toggle them and refresh the session source registry.
Only plugins advertising `HAS_REPOSITORIES` get repository management.

Ratings use `/reviews/ratings`; reviews use `/reviews/apps/<app>` and are
account backed through the system `org.matonos.account` AccountManager entry.
Stars remain anonymous. The store asks AccountManager for its `session` token
only after the user chooses “Sign in to write a review”; it does not persist
passwords or tokens. The authenticator returns the machine id through its
AccountManager token bundle; the store sends it as `X-Maton-Machine-Id`, which
the server uses to bind a session to its device.
Review text and summaries are store owned and identical across sources.

## Opening local Flatpak bundles

The Software Centre accepts `.flatpak` files from Android's file picker or
another document provider (`application/vnd.flatpak`, with a `.flatpak` path
fallback for providers that send a generic MIME type). It reads the provider's
`content://` URI and file name, then finds the enabled source that advertises
Flatpak. The operation is available only when that source reports contract
revision 2 or newer. `.flatpakref` files are not supported.

Opening a bundle shows a confirmation with the file name and an unverified
source warning. The install request is sent only after the user selects
**Install anyway**; that confirmation is the only store path that sets
`allowUnsigned=true`. The Flatpak source reports whether the bundle signature
is signed or unsigned in the normal install progress line. APK staging,
PackageInstaller commit, progress, and cancellation use the source install
operation path. A missing or old Flatpak source is shown as a clear error.

To exercise the flow on a fresh test image, create or obtain a `.flatpak`
bundle, open it from the device's file picker, verify the file name and warning,
then cancel and confirm no install starts. Open it again, confirm, and check
that progress reports `Local bundle signature: signed` or `Local bundle
signature: unsigned`. Repeat with Flatpak source disabled or an older source
revision and verify that installation is blocked with the source error.

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


## Source catalogue index (contract v5)

Source plugins now provide one read-only JSON catalogue file descriptor plus a cheap generation number. The store streams each changed catalogue into its own SQLite database, keyed by source, with FTS for app name, summary, and id. Search, Popular, New, installed, updates, and repository-choice ordering are local SQL queries; screens continue to use the existing `Source` interface. Ratings remain store-owned.

Validation: TypeScript and script tests are expected via `npm run typecheck`, `npm run lint`, and the `test:*` scripts. Native module Java is checked with `ANDROID_HOME=/home/hanro50/Android/Sdk ./gradlew :app:compileDebugJavaWithJavac` from `android/`. No VM or deployment test is part of the catalogue change.
