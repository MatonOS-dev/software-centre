package org.matonos.software.nativebridge

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.matonos.software.sources.SourcePlugins

class MatonOSExpoModule : Module() {
  companion object { @Volatile var packageEventSink: ((String, String, Int, Long, Long, Map<String, Any>?) -> Unit)? = null }
  private var plugins: SourcePlugins? = null
  private val sourceCallQueue = CoroutineScope(SupervisorJob() + Dispatchers.IO)
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
    // Catch packages left unused while the store was closed.
    OnActivityEntersForeground { requirePlugins().removeUnused() }
    OnDestroy { plugins?.close(); plugins = null; packageEventSink = null; sourceCallQueue.cancel() }
    // Store source plugins (SOURCE-PLUGINS.md). Calls return the plugin's JSON as-is.
    AsyncFunction("sourcePlugins") { requirePlugins().list() }
    AsyncFunction("getBrowseCache") { key: String ->
      requireNotNull(appContext.reactContext).getSharedPreferences("software-centre", android.content.Context.MODE_PRIVATE).getString("browse:$key", null)
    }
    AsyncFunction("setBrowseCache") { key: String, value: String ->
      requireNotNull(appContext.reactContext).getSharedPreferences("software-centre", android.content.Context.MODE_PRIVATE).edit().putString("browse:$key", value).apply()
    }
    AsyncFunction("accountSession") { promise: Promise ->
      val context = requireNotNull(appContext.reactContext)
      val manager = android.accounts.AccountManager.get(context)
      manager.getAuthTokenByFeatures("org.matonos.account", "session", null, appContext.currentActivity, null, android.os.Bundle(), { future ->
        try {
          val result = future.result
          val token = result.getString(android.accounts.AccountManager.KEY_AUTHTOKEN)
          if (token.isNullOrBlank()) throw IllegalStateException("MatonOS account did not return a session token")
          val machineId = result.getString("org.matonos.account.machine_id")
            ?: throw IllegalStateException("MatonOS account did not return the machine id")
          promise.resolve(mapOf("token" to token, "machineId" to machineId))
        } catch (error: Exception) { promise.reject("ACCOUNT_SESSION", error.message ?: "Account sign-in failed", error) }
      }, android.os.Handler(android.os.Looper.getMainLooper()))
    }
    Function("invalidateAccountSession") { token: String ->
      android.accounts.AccountManager.get(requireNotNull(appContext.reactContext)).invalidateAuthToken("org.matonos.account", token)
      true
    }
    AsyncFunction("setSourceEnabled") { pkg: String, enabled: Boolean -> requirePlugins().setEnabled(pkg, enabled) }
    AsyncFunction("sourceInfo") { pkg: String -> json.toJson(sourceCall(pkg) { it.info() }) }.runOnQueue(sourceCallQueue)
    // Live boots keep /data in RAM: installs vanish on reboot and big downloads can run out of memory.
    AsyncFunction("isLiveImage") { liveImage() }
    AsyncFunction("sourceUnavailableOwners") { json.toJson(requirePlugins().unavailableOwners()) }
    AsyncFunction("sourceQuery") { pkg: String, kind: String, term: String, offset: Int, limit: Int -> requirePlugins().query(pkg, kind, term, offset, limit) }.runOnQueue(sourceCallQueue)
    AsyncFunction("sourceRepositories") { pkg: String -> requirePlugins().repositories(pkg) }.runOnQueue(sourceCallQueue)
    AsyncFunction("sourceSettings") { pkg: String -> json.toJson(sourceCall(pkg) { it.settings() }) }.runOnQueue(sourceCallQueue)
    AsyncFunction("sourceSetSetting") { pkg: String, id: String, value: String? -> sourceCall(pkg) { it.setSetting(id, value) } }.runOnQueue(sourceCallQueue)
    AsyncFunction("sourceRunAction") { pkg: String, id: String, values: List<String>, confirmed: Boolean ->
      val result = sourceCall(pkg) { it.runAction(id, values.toTypedArray(), confirmed) }
      if (result.launch) {
        val context = requireNotNull(appContext.reactContext)
        val intent = android.content.Intent("org.matonos.store.SOURCE_LOGIN").setPackage(pkg).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        if (context.packageManager.resolveActivity(intent, 0) == null) throw IllegalStateException("No source activity for action $id")
        context.startActivity(intent)
      }
      json.toJson(result)
    }.runOnQueue(sourceCallQueue)
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
        // The source service's own icon (falls back to the app icon), so a plugin
        // hosted inside a larger app shows its catalogue rather than the host app.
        val pm = context.packageManager
        val service = pm.queryIntentServices(android.content.Intent(org.matonos.software.sources.SourcePlugins.ACTION).setPackage(pkg), 0).firstOrNull()
        val drawable = service?.loadIcon(pm) ?: pm.getApplicationIcon(pkg)
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
    AsyncFunction("sourceDetails") { pkg: String, id: String, repo: String ->
      val details = sourceCall(pkg) { it.details(id, repo) }; applyStoredOrigins(pkg, arrayOf(details.listing)); json.toJson(details)
    }.runOnQueue(sourceCallQueue)
    AsyncFunction("sourceReviews") { pkg: String, id: String, offset: Int, limit: Int -> json.toJson(sourceCall(pkg) { it.reviews(id, offset, limit) }) }.runOnQueue(sourceCallQueue)
    AsyncFunction("sourceInstall") { pkg: String, id: String, repo: String, operationId: String ->
      if (liveImage()) throw IllegalStateException("Apps can't be installed on the live image. Install MatonOS first.")
      requirePlugins().install(pkg, id, repo, operationId)
    }
    AsyncFunction("sourceCancel") { pkg: String, operationId: String -> requirePlugins().cancel(pkg, operationId) }
    AsyncFunction("sourceRunning") { pkg: String, operationId: String -> requirePlugins().running(pkg, operationId) }
    AsyncFunction("sourceUninstall") { pkg: String, packageName: String, operationId: String ->
      requirePlugins().uninstall(pkg, packageName, operationId)
    }

  }

  private fun applyStoredOrigins(pkg: String, rows: Array<org.matonos.store.source.types.AppListing>) {
    val manager = requirePlugins()
    rows.forEach { row ->
      val packageName = row.packageName?.takeIf { it.isNotBlank() } ?: row.id
      val owner = manager.owner(packageName)
      if (owner?.source == pkg) { row.repo = owner.repo; row.installed = true }
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


  private fun liveImage(): Boolean {
    val process = ProcessBuilder("/system/bin/getprop", "ro.boot.matonos.live").redirectErrorStream(true).start()
    val output = process.inputStream.bufferedReader().use { it.readText().trim() }
    val code = process.waitFor()
    if (code != 0) throw IllegalStateException("getprop ro.boot.matonos.live exited $code: $output")
    return output == "1"
  }
}
