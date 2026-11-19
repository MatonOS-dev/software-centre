package org.matonos.software.nativebridge

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.matonos.software.sources.SourcePlugins

class MatonOSExpoModule : Module() {
  companion object { @Volatile var packageEventSink: ((String, String, Int, Long, Long, Map<String, Any>?) -> Unit)? = null }
  private var plugins: SourcePlugins? = null
  /** Contract parcelables → JSON for JS; field names match src/sources/Source.ts. */
  private val json = com.google.gson.Gson()

  override fun definition() = ModuleDefinition {
    Name("MatonOSClient")
    Events("linuxAppStoreEvent")
    OnCreate { packageEventSink = { operationId, phase, percent, bytesDone, bytesTotal, result ->
      val event = mutableMapOf<String, Any>("source" to (result?.get("source") ?: ""), "operationId" to operationId, "phase" to phase, "percent" to percent)
      if (bytesDone >= 0) event["bytesDone"] = bytesDone
      if (bytesTotal >= 0) event["bytesTotal"] = bytesTotal
      if (result != null) event["result"] = result
      sendEvent("linuxAppStoreEvent", event)
    } }
    OnDestroy { plugins?.close(); plugins = null; packageEventSink = null }
    // Store source plugins (SOURCE-PLUGINS.md). Calls return the plugin's JSON as-is.
    AsyncFunction("sourcePlugins") { requirePlugins().list() }
    AsyncFunction("getBrowseCache") { key: String ->
      requireNotNull(appContext.reactContext).getSharedPreferences("software-centre", android.content.Context.MODE_PRIVATE).getString("browse:$key", null)
    }
    AsyncFunction("setBrowseCache") { key: String, value: String ->
      requireNotNull(appContext.reactContext).getSharedPreferences("software-centre", android.content.Context.MODE_PRIVATE).edit().putString("browse:$key", value).apply()
    }
    AsyncFunction("setSourceEnabled") { pkg: String, enabled: Boolean -> requirePlugins().setEnabled(pkg, enabled) }
    AsyncFunction("sourceInfo") { pkg: String -> json.toJson(sourceCall(pkg) { it.info() }) }
    AsyncFunction("sourceUnavailableOwners") { json.toJson(requirePlugins().unavailableOwners()) }
    AsyncFunction("sourceSearch") { pkg: String, term: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.search(term, offset, limit) }) }
    AsyncFunction("sourceCollection") { pkg: String, kind: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.collection(kind, offset, limit) }) }
    AsyncFunction("sourcePopularApps") { pkg: String, limit: Int -> json.toJson(sourceCall(pkg) { it.getPopularApps(limit) }) }
    AsyncFunction("sourceSetRepoEnabled") { pkg: String, id: String, enabled: Boolean -> sourceCall(pkg) { it.setRepoEnabled(id, enabled) } }
    AsyncFunction("describeAndroidPermissions") { names: List<String> ->
      val context = requireNotNull(appContext.reactContext)
      json.toJson(names.distinct().map { name ->
        try {
          val permission = context.packageManager.getPermissionInfo(name, 0)
          mapOf(
            "name" to name,
            "label" to permission.loadLabel(context.packageManager).toString(),
            "group" to permission.group,
            "groupLabel" to permission.group?.let { group ->
              try { context.packageManager.getPermissionGroupInfo(group, 0).loadLabel(context.packageManager).toString() }
              catch (_: android.content.pm.PackageManager.NameNotFoundException) { group }
            },
            "dangerous" to ((permission.protectionLevel and android.content.pm.PermissionInfo.PROTECTION_MASK_BASE) == android.content.pm.PermissionInfo.PROTECTION_DANGEROUS),
          )
        } catch (_: android.content.pm.PackageManager.NameNotFoundException) {
          mapOf("name" to name, "label" to null, "group" to null, "groupLabel" to null, "dangerous" to false)
        }
      })
    }
    AsyncFunction("sourceIcon") { pkg: String ->
      val context = requireNotNull(appContext.reactContext)
      try {
        val drawable = context.packageManager.getApplicationIcon(pkg)
        val bitmap = android.graphics.Bitmap.createBitmap(96, 96, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        val directory = java.io.File(context.cacheDir, "software-source-icons").apply { mkdirs() }
        val image = java.io.File(directory, "${pkg.hashCode()}.png")
        java.io.FileOutputStream(image).use { output -> bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output) }
        bitmap.recycle()
        android.net.Uri.fromFile(image).toString()
      } catch (error: android.content.pm.PackageManager.NameNotFoundException) {
        android.util.Log.e("MatonOSStore", "Source package icon unavailable package=$pkg", error)
        null
      }
    }
    AsyncFunction("launchAndroidApp") { packageName: String ->
      val context = requireNotNull(appContext.reactContext)
      val intent = context.packageManager.getLaunchIntentForPackage(packageName)
        ?: throw IllegalArgumentException("No launch activity for installed package $packageName")
      intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }
    AsyncFunction("sourceDetails") { pkg: String, id: String, repo: String -> json.toJson(sourceCall(pkg) { it.details(id, repo) }) }
    AsyncFunction("sourceReviews") { pkg: String, id: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.reviews(id, offset, limit) }) }
    AsyncFunction("sourceInstalled") { pkg: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.installed(offset, limit) }) }
    AsyncFunction("sourceUpdates") { pkg: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.updates(offset, limit) }) }
    AsyncFunction("sourceRepos") { pkg: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.repos(offset, limit) }) }
    AsyncFunction("sourceAddRepo") { pkg: String, url: String -> sourceCall(pkg) { it.addRepo(url) } }
    AsyncFunction("sourceAddRepoNamed") { pkg: String, name: String, url: String -> sourceCall(pkg) { source ->
      if (source.info().revision >= 6) source.addRepoNamed(name, url)
      else { android.util.Log.w("MatonOSStore", "Source $pkg contract revision ${source.info().revision} ignores repository name"); source.addRepo(url) }
    } }
    AsyncFunction("sourceDelRepo") { pkg: String, id: String -> sourceCall(pkg) { it.delRepo(id) } }
    AsyncFunction("sourceInstall") { pkg: String, id: String, repo: String, operationId: String -> requirePlugins().install(pkg, id, repo, operationId) }
    AsyncFunction("sourceCancel") { pkg: String, operationId: String -> requirePlugins().cancel(pkg, operationId) }
    AsyncFunction("sourceRunning") { pkg: String, operationId: String -> requirePlugins().running(pkg, operationId) }
    AsyncFunction("sourceUninstall") { pkg: String, packageName: String, operationId: String ->
      requirePlugins().uninstall(pkg, packageName, operationId)
    }

  }

  private fun packageResultIntent(context: android.content.Context, operationId: String, kind: String, source: String): android.app.PendingIntent {
    val intent = android.content.Intent(context, SourceInstallReceiver::class.java)
      .putExtra(SourceInstallReceiver.EXTRA_OPERATION_ID, operationId)
      .putExtra(SourceInstallReceiver.EXTRA_KIND, kind)
      .putExtra(SourceInstallReceiver.EXTRA_SOURCE, source)
    return android.app.PendingIntent.getBroadcast(context, (operationId + kind).hashCode(), intent,
      android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE)
  }

  private inline fun <T> sourceCall(pkg: String, call: (org.matonos.store.source.ISoftwareSource) -> T): T {
    val manager = requirePlugins()
    try { return call(manager.source(pkg)) }
    catch (error: Exception) {
      if (error is android.os.RemoteException) throw manager.remoteFailure(pkg, error)
      throw error
    }
  }

  private fun requirePlugins(): SourcePlugins = plugins ?: synchronized(this) {
    plugins ?: SourcePlugins(requireNotNull(appContext.reactContext), object : SourcePlugins.Events {
      override fun progress(source: String, operationId: String, phase: String, percent: Int, done: Long, total: Long) {
        sendEvent("linuxAppStoreEvent", mapOf("source" to source, "operationId" to operationId, "phase" to phase,
          "percent" to percent, "bytesDone" to done, "bytesTotal" to total))
      }
      override fun result(source: String, operationId: String, ok: Boolean, error: String?) {
        sendEvent("linuxAppStoreEvent", mapOf("source" to source, "operationId" to operationId, "phase" to "complete", "percent" to 100,
          "result" to mapOf("ok" to ok, "error" to (error ?: ""), "operationId" to operationId, "source" to source)))
      }
      override fun commitTarget(source: String, operationId: String) =
        packageResultIntent(requireNotNull(appContext.reactContext), operationId, "install", source).intentSender
    }).also { plugins = it }
  }

}
