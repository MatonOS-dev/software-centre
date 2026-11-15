package org.matonos.flathub.nativebridge

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.matonos.linux.ILinuxAppStore
import org.matonos.linux.ILinuxAppStoreCallback
import org.matonos.flathub.sources.SourcePlugins
import java.util.concurrent.ConcurrentHashMap

class MatonOSExpoModule : Module() {
  private val storeConnections = ConcurrentHashMap.newKeySet<android.content.ServiceConnection>()
  private var plugins: SourcePlugins? = null
  /** Contract parcelables → JSON for JS; field names match src/sources/Source.ts. */
  private val json = com.google.gson.Gson()

  override fun definition() = ModuleDefinition {
    Name("MatonOSClient")
    Events("linuxAppStoreEvent")
    OnCreate {
      packageEventSink = { operationId, phase, percent, bytesDone, bytesTotal, result ->
        val event = mutableMapOf<String, Any>("source" to (result?.get("source") ?: ""), "operationId" to operationId, "phase" to phase, "percent" to percent)
        if (bytesDone >= 0) event["bytesDone"] = bytesDone
        if (bytesTotal >= 0) event["bytesTotal"] = bytesTotal
        if (result != null) event["result"] = result
        sendEvent("linuxAppStoreEvent", event)
      }
    }
    OnDestroy {
      val context = appContext.reactContext
      if (context != null) storeConnections.forEach { try { context.unbindService(it) } catch (error: Exception) { android.util.Log.e("MatonOSStore", "Unbinding Linux store connection failed", error) } }
      storeConnections.clear()
      plugins?.close()
      plugins = null
      packageEventSink = null
    }
    // "Install me" / "update me": wait for the stub, then start its activity
    // (found by its Flatpak ref metadata). The stub calls the subsystem store itself;
    // "install me" does nothing if the Flatpak is installed, so it also resumes.
    AsyncFunction("startStubInstall") { ref: String, operationId: String? ->
      startStubActivity(STUB_INSTALL_ACTION, ref, operationId)
    }
    AsyncFunction("startStubUpdate") { ref: String, operationId: String? ->
      startStubActivity(STUB_UPDATE_ACTION, ref, operationId)
    }
    // Store source plugins (SOURCE-PLUGINS.md). Calls return the plugin's JSON as-is.
    AsyncFunction("sourcePlugins") { requirePlugins().list() }
    AsyncFunction("setSourceEnabled") { pkg: String, enabled: Boolean -> requirePlugins().setEnabled(pkg, enabled) }
    AsyncFunction("sourceInfo") { pkg: String -> json.toJson(requirePlugins().source(pkg).info()) }
    AsyncFunction("sourceSearch") { pkg: String, term: String, offset: Int, limit: Int -> json.toJson(requirePlugins().source(pkg).search(term, offset, limit)) }
    AsyncFunction("sourceDetails") { pkg: String, id: String, repo: String -> json.toJson(requirePlugins().source(pkg).details(id, repo)) }
    AsyncFunction("sourceReviews") { pkg: String, id: String, offset: Int, limit: Int -> json.toJson(requirePlugins().source(pkg).reviews(id, offset, limit)) }
    AsyncFunction("sourceInstalled") { pkg: String, offset: Int, limit: Int -> json.toJson(requirePlugins().source(pkg).installed(offset, limit)) }
    AsyncFunction("sourceUpdates") { pkg: String, offset: Int, limit: Int -> json.toJson(requirePlugins().source(pkg).updates(offset, limit)) }
    AsyncFunction("sourceRepos") { pkg: String, offset: Int, limit: Int -> json.toJson(requirePlugins().source(pkg).repos(offset, limit)) }
    AsyncFunction("sourceAddRepo") { pkg: String, url: String -> requirePlugins().source(pkg).addRepo(url) }
    AsyncFunction("sourceDelRepo") { pkg: String, id: String -> requirePlugins().source(pkg).delRepo(id) }
    AsyncFunction("sourceInstall") { pkg: String, id: String, repo: String, operationId: String -> requirePlugins().install(pkg, id, repo, operationId) }
    AsyncFunction("sourceCancel") { pkg: String, operationId: String -> requirePlugins().source(pkg).cancel(operationId) }
    AsyncFunction("sourceUninstall") { pkg: String, packageName: String, operationId: String ->
      requirePlugins().uninstall(pkg, packageName, operationId)
    }
    AsyncFunction("launchStub") { appId: String -> launchStub(appId) }
    AsyncFunction("storeInstall") { ref: String, operationId: String, promise: Promise ->
      withStore(promise) { store ->
        store.addRemote("flathub", FLATHUB_URL, "${operationId}_remote", object : Callback() {
          override fun onResult(id: String, ok: Boolean, error: String?) {
            if (!ok && error?.contains("already exists", ignoreCase = true) != true) {
              emitResult(operationId, false, error)
              promise.reject("STORE_INSTALL", error ?: "Could not configure Flathub", null)
              return
            }
            store.install(ref, "flathub", operationId, callbackFor())
            promise.resolve(true)
          }
        })
      }
    }
    AsyncFunction("storeUpdate") { ref: String, operationId: String, promise: Promise ->
      withStore(promise) { it.update(ref, operationId, callbackFor()); promise.resolve(true) }
    }
    AsyncFunction("storeUninstall") { ref: String, operationId: String, promise: Promise ->
      withStore(promise) { it.uninstall(ref, operationId, callbackFor()); promise.resolve(true) }
    }
    AsyncFunction("storeListInstalled") { promise: Promise -> withStore(promise) { promise.resolve(it.listInstalled()) } }
    AsyncFunction("storeListRemotes") { promise: Promise -> withStore(promise) { promise.resolve(it.listRemotes()) } }
  }

  private fun packageResultIntent(context: android.content.Context, operationId: String, kind: String, source: String): android.app.PendingIntent {
    val intent = android.content.Intent(context, SourceInstallReceiver::class.java)
      .putExtra(SourceInstallReceiver.EXTRA_OPERATION_ID, operationId)
      .putExtra(SourceInstallReceiver.EXTRA_KIND, kind)
      .putExtra(SourceInstallReceiver.EXTRA_SOURCE, source)
    return android.app.PendingIntent.getBroadcast(context, (operationId + kind).hashCode(), intent,
      android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE)
  }

  private abstract inner class Callback : ILinuxAppStoreCallback.Stub() {
    override fun onProgress(id: String, phase: String, percent: Int, bytesDone: Long, bytesTotal: Long) {
      sendEvent("linuxAppStoreEvent", mapOf("operationId" to id, "phase" to phase, "percent" to percent,
        "bytesDone" to bytesDone, "bytesTotal" to bytesTotal))
    }
    open override fun onResult(id: String, ok: Boolean, error: String?) { emitResult(id, ok, error) }
  }

  private fun callbackFor() = object : Callback() {
    override fun onResult(operationId: String, ok: Boolean, error: String?) {
      emitResult(operationId, ok, error)
    }
  }

  private fun emitResult(id: String, ok: Boolean, error: String?) {
    sendEvent("linuxAppStoreEvent", mapOf("operationId" to id, "phase" to "complete", "percent" to 100,
      "result" to mapOf("ok" to ok, "error" to (error ?: ""), "operationId" to id)))
  }

  private fun withStore(promise: Promise, action: (ILinuxAppStore) -> Unit) {
    val context = requireNotNull(appContext.reactContext)
    val intent = android.content.Intent().setClassName("org.matonos.linux", "org.matonos.linux.LinuxAppStoreService")
    val connection = object : android.content.ServiceConnection {
      override fun onServiceConnected(name: android.content.ComponentName, binder: android.os.IBinder) {
        try { action(ILinuxAppStore.Stub.asInterface(binder)) }
        catch (error: Exception) { promise.reject("STORE_SERVICE", error.message ?: "Store service failed", error) }
      }
      override fun onServiceDisconnected(name: android.content.ComponentName) { }
    }
    storeConnections.add(connection)
    if (!context.bindService(intent, connection, android.content.Context.BIND_AUTO_CREATE))
      promise.reject("STORE_UNAVAILABLE", "MatonOS Linux store service is unavailable", null)
  }

  private fun startStubActivity(action: String, ref: String, operationId: String?): Boolean {
    val context = requireNotNull(appContext.reactContext)
    val deadline = android.os.SystemClock.elapsedRealtime() + 60_000
    fun find() = context.packageManager.queryIntentActivities(
      android.content.Intent(action), android.content.pm.PackageManager.GET_META_DATA)
      .firstOrNull { it.activityInfo.metaData?.getString(STUB_REF_META) == ref }
    var match = find()
    while (match == null && android.os.SystemClock.elapsedRealtime() < deadline) {
      Thread.sleep(500)
      match = find()
    }
    if (match == null) return false
    val intent = android.content.Intent(action)
      .setClassName(match.activityInfo.packageName, match.activityInfo.name)
      .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    if (!operationId.isNullOrEmpty()) intent.putExtra(STUB_OPERATION_EXTRA, operationId)
    context.startActivity(intent)
    return true
  }

  private fun launchStub(appId: String): Boolean {
    val context = requireNotNull(appContext.reactContext)
    val intent = android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER)
    val match = context.packageManager.queryIntentActivities(intent, android.content.pm.PackageManager.GET_META_DATA)
      .firstOrNull { it.activityInfo.metaData?.getString(STUB_REF_META)?.startsWith("app/$appId/") == true }
      ?: return false
    context.startActivity(intent.setClassName(match.activityInfo.packageName, match.activityInfo.name)
      .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    return true
  }

  companion object {
    @Volatile var packageEventSink: ((String, String, Int, Long, Long, Map<String, Any>?) -> Unit)? = null
    const val FLATHUB_URL = "https://dl.flathub.org/repo/flathub.flatpakrepo"
    const val STUB_INSTALL_ACTION = "org.matonos.linuxhost.INSTALL"
    const val STUB_UPDATE_ACTION = "org.matonos.linuxhost.UPDATE"
    const val STUB_OPERATION_EXTRA = "org.matonos.linuxhost.OPERATION_ID"
    const val STUB_REF_META = "org.matonos.linuxhost.FLATPAK_REF"
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
