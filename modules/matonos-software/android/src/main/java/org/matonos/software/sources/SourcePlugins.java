package org.matonos.software.sources;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.IBinder;
import android.os.RemoteException;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import org.matonos.store.source.ICommitResult;
import org.matonos.store.source.IInstallCallback;
import org.matonos.store.source.ISoftwareSource;

import java.io.InputStream;
import java.util.Arrays;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Finds, enables and talks to store source plugins. Preinstalled plugins are
 * enabled by default; any other plugin stays off until the user enables it.
 * Only the store commits APKs: plugins hand them over through IInstallCallback.commit.
 */
public final class SourcePlugins {
  public static final String ACTION = "org.matonos.store.SOURCE";
  /** Signature permission defined by the store; a plugin service must require it. */
  public static final String BIND_PERMISSION = "org.matonos.permission.BIND_STORE_SOURCE";
  private static final String TAG = "SourcePlugins";
  private static final String PREFS = "source-plugins";
  private static final String OWNERS = "source-ownership";
  private static final long BIND_TIMEOUT_S = 20;

  public interface Events {
    void progress(String source, String operationId, String phase, int percent, long done, long total);
    void result(String source, String operationId, boolean ok, String error);
    /** Commit result intent for one PackageInstaller session. */
    android.content.IntentSender commitTarget(String source, String operationId);
  }

  private final Context context;
  private final CatalogueIndex catalogueIndex;
  private final Events events;
  private final Map<String, Connection> connections = new ConcurrentHashMap<>();
  private final Map<String, Object> connectionLocks = new ConcurrentHashMap<>();
  private final Map<String, Integer> uncommittedSessions = new ConcurrentHashMap<>();
  private final Map<String, Ownership> pendingOwners = new ConcurrentHashMap<>();
  private final Map<String, Completion> completions = new ConcurrentHashMap<>();
  private final Map<String, String> labels = new ConcurrentHashMap<>();
  private final Map<String, String> operationSources = new ConcurrentHashMap<>();

  public static final class Ownership {
    public final String source, id, repo;
    Ownership(String source, String id, String repo) { this.source = source; this.id = id; this.repo = repo; }
  }
  public interface Completion { void finish(boolean ok, String reason); }
  public Ownership owner(String packageName) {
    String value = context.getSharedPreferences(OWNERS, Context.MODE_PRIVATE).getString(packageName, null);
    if (value == null) return null;
    try { org.json.JSONObject o = new org.json.JSONObject(value); return new Ownership(o.getString("source"), o.getString("id"), o.getString("repo")); }
    catch (Exception e) { Log.e(TAG, "Invalid ownership record package=" + packageName, e); return null; }
  }
  private void recordOwner(String packageName, Ownership owner) {
    try { context.getSharedPreferences(OWNERS, Context.MODE_PRIVATE).edit().putString(packageName,
        new org.json.JSONObject().put("source", owner.source).put("id", owner.id).put("repo", owner.repo).toString()).apply(); }
    catch (Exception e) { Log.e(TAG, "Recording owner package=" + packageName + " failed", e); }
  }

  public void update(String pkg, String id, String repo, String operationId, Completion completion) throws Exception {
    completions.put(operationId, completion);
    install(pkg, id, repo, operationId);
  }

  public RuntimeException remoteFailure(String pkg, Exception error) {
    if (error instanceof android.os.DeadObjectException || error instanceof RemoteException) {
      String label = labels.getOrDefault(pkg, pkg);
      Log.e(TAG, "Source binder call failed source=" + pkg + " label=" + label + " error=" + error, error);
      disconnect(pkg);
      return new IllegalStateException(label + " stopped", error);
    }
    return new IllegalStateException(error.getMessage() == null ? pkg + ": source call failed" : error.getMessage(), error);
  }

  /** Installed packages whose persisted owner is currently missing or disabled. */
  public List<Map<String, String>> unavailableOwners() {
    List<Map<String, String>> out = new ArrayList<>();
    Map<String, ?> records = context.getSharedPreferences(OWNERS, Context.MODE_PRIVATE).getAll();
    Map<String, Boolean> enabled = new HashMap<>();
    for (Map<String, Object> row : list()) enabled.put((String) row.get("package"), (Boolean) row.get("enabled"));
    PackageManager pm = context.getPackageManager();
    for (Map.Entry<String, ?> entry : records.entrySet()) {
      String packageName = entry.getKey();
      try {
        pm.getPackageInfo(packageName, 0);
        org.json.JSONObject value = new org.json.JSONObject(String.valueOf(entry.getValue()));
        String owner = value.getString("source");
        if (Boolean.TRUE.equals(enabled.get(owner))) continue;
        ApplicationInfo app = pm.getApplicationInfo(packageName, 0);
        Map<String, String> row = new HashMap<>();
        row.put("packageName", packageName); row.put("source", owner);
        row.put("id", value.getString("id")); row.put("repo", value.getString("repo"));
        row.put("name", String.valueOf(pm.getApplicationLabel(app)));
        out.add(row);
      } catch (PackageManager.NameNotFoundException missing) {
        Log.i(TAG, "Owned package no longer installed package=" + packageName);
      } catch (Exception error) { Log.e(TAG, "Reading unavailable ownership package=" + packageName + " failed", error); }
    }
    return out;
  }

  public SourcePlugins(Context context, Events events) {
    this.context = context.getApplicationContext();
    this.events = events;
    this.catalogueIndex = new CatalogueIndex(this.context);
    // Removing an app can leave its runtimes and extensions unused, also when removed from Settings.
    android.content.IntentFilter removed = new android.content.IntentFilter(Intent.ACTION_PACKAGE_FULLY_REMOVED);
    removed.addDataScheme("package");
    this.context.registerReceiver(packageRemoved, removed, Context.RECEIVER_EXPORTED);
  }

  private final java.util.concurrent.ExecutorService unusedCleanup = java.util.concurrent.Executors.newSingleThreadExecutor();
  private final java.util.concurrent.atomic.AtomicBoolean unusedCleanupQueued = new java.util.concurrent.atomic.AtomicBoolean();
  private final android.content.BroadcastReceiver packageRemoved = new android.content.BroadcastReceiver() {
    @Override public void onReceive(Context ignored, Intent intent) {
      if (intent.getData() != null && owner(intent.getData().getSchemeSpecificPart()) != null) removeUnused();
    }
  };

  /**
   * Asks each enabled source which of its packages nothing needs any more and
   * removes those recorded to that source. Runs in the background; requests
   * while one is queued collapse into it.
   */
  public void removeUnused() {
    if (!unusedCleanupQueued.compareAndSet(false, true)) return;
    unusedCleanup.execute(() -> {
      unusedCleanupQueued.set(false);
      for (Map<String, Object> row : list()) {
        if (!Boolean.TRUE.equals(row.get("enabled"))) continue;
        String pkg = String.valueOf(row.get("package"));
        String[] unused;
        try { unused = source(pkg).unusedPackages(); }
        catch (Exception error) { Log.e(TAG, pkg + ": listing unused packages failed", error); continue; }
        for (String packageName : unused) {
          Ownership owner = owner(packageName);
          if (owner == null || !pkg.equals(owner.source)) { Log.i(TAG, pkg + ": keeping unused " + packageName + "; it was not installed through this source"); continue; }
          Log.i(TAG, pkg + ": removing unused " + packageName);
          context.getPackageManager().getPackageInstaller().uninstall(packageName, unusedRemovalResult(packageName));
        }
      }
    });
  }

  private android.content.IntentSender unusedRemovalResult(String packageName) {
    String action = context.getPackageName() + ".UNUSED_REMOVED." + packageName;
    context.registerReceiver(new android.content.BroadcastReceiver() {
      @Override public void onReceive(Context ignored, Intent intent) {
        context.unregisterReceiver(this);
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        // Background cleanup never prompts; a removal that needs the user is reported, not shown.
        if (status != PackageInstaller.STATUS_SUCCESS)
          Log.e(TAG, "Removing unused " + packageName + " failed: status " + status + " " + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
      }
    }, new android.content.IntentFilter(action), Context.RECEIVER_NOT_EXPORTED);
    return android.app.PendingIntent.getBroadcast(context, 0, new Intent(action).setPackage(context.getPackageName()),
        android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE).getIntentSender();
  }

  /** Every installed plugin service that requires the store's bind permission. */
  public List<Map<String, Object>> list() {
    PackageManager pm = context.getPackageManager();
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    List<Map<String, Object>> out = new ArrayList<>();
    for (ResolveInfo info : pm.queryIntentServices(new Intent(ACTION), 0)) {
      if (!BIND_PERMISSION.equals(info.serviceInfo.permission)) {
        Log.w(TAG, info.serviceInfo.packageName + " offers a source without requiring " + BIND_PERMISSION + "; ignored");
        continue;
      }
      ApplicationInfo app = info.serviceInfo.applicationInfo;
      boolean preinstalled = (app.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
      Map<String, Object> row = new HashMap<>();
      row.put("package", app.packageName);
      row.put("service", info.serviceInfo.name);
      row.put("label", String.valueOf(info.loadLabel(pm)));
      row.put("preinstalled", preinstalled);
      row.put("enabled", prefs.getBoolean(app.packageName, preinstalled));
      labels.put(app.packageName, String.valueOf(info.loadLabel(pm)));
      out.add(row);
    }
    return out;
  }

  public void setEnabled(String pkg, boolean enabled) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(pkg, enabled).apply();
    if (!enabled) disconnect(pkg);
  }

  /** Binds (blocking, off the main thread) to an enabled plugin. */
  public ISoftwareSource source(String pkg) throws Exception {
    Object lock = connectionLocks.computeIfAbsent(pkg, ignored -> new Object());
    synchronized (lock) {
      Map<String, Object> row = null;
      for (Map<String, Object> candidate : list()) if (pkg.equals(candidate.get("package"))) row = candidate;
      if (row == null) throw new IllegalArgumentException("No store source plugin in " + pkg);
      if (!(Boolean) row.get("enabled")) throw new IllegalStateException("Store source " + pkg + " is disabled");
      Connection connection = connections.get(pkg);
      if (connection == null || connection.binder == null || !connection.binder.isBinderAlive()) {
        if (connection != null) disconnect(pkg);
        connection = new Connection();
        Intent intent = new Intent(ACTION).setClassName(pkg, (String) row.get("service"));
        if (!context.bindService(intent, connection, Context.BIND_AUTO_CREATE))
          throw new IllegalStateException("Cannot bind store source " + pkg);
        connections.put(pkg, connection);
        if (!connection.ready.await(BIND_TIMEOUT_S, TimeUnit.SECONDS)) {
          disconnect(pkg);
          throw new IllegalStateException("Store source " + pkg + " did not connect within " + BIND_TIMEOUT_S + " s");
        }
      }
      return ISoftwareSource.Stub.asInterface(connection.binder);
    }
  }

  public String query(String pkg,String kind,String term,int offset,int limit) throws Exception {
    ISoftwareSource plugin=source(pkg);
    // Version first: a package event between the calls must leave the import stale, not mislabelled.
    long version=plugin.catalogueVersion();ParcelFileDescriptor catalogue=plugin.catalogue();
    catalogueIndex.importIfChanged(pkg,version,catalogue);
    return catalogueIndex.query(pkg,kind,term,offset,limit);
  }
  public String repositories(String pkg) throws Exception {
    ISoftwareSource plugin=source(pkg);
    // Version first: a package event between the calls must leave the import stale, not mislabelled.
    long version=plugin.catalogueVersion();ParcelFileDescriptor catalogue=plugin.catalogue();
    catalogueIndex.importIfChanged(pkg,version,catalogue);
    return catalogueIndex.repositories(pkg);
  }

  public void install(String pkg, String id, String repo, String operationId) throws Exception {
    invokeInstall(pkg, operationId, new Ownership(pkg, id, repo));
    try { source(pkg).install(id, repo, operationId, callback(pkg, id)); }
    catch (Exception error) { installCallFailed(pkg, operationId, error); }
  }

  /** Resolve the enabled source that advertises itself as Flatpak, then enforce the local-file contract. */
  public String requireLocalBundleSource() throws Exception {
    String match = null;
    for (Map<String, Object> row : list()) {
      if (!Boolean.TRUE.equals(row.get("enabled"))) continue;
      String pkg = String.valueOf(row.get("package"));
      org.matonos.store.source.types.SourceInfo info;
      try { info = source(pkg).info(); }
      catch (Exception error) { Log.e(TAG, "Reading source info while finding local-file source package=" + pkg + " failed", error); continue; }
      if ((info.capabilities & org.matonos.store.source.ISoftwareSource.CAP_LOCAL_FILES) != 0) {
        if (match != null) throw new IllegalStateException("More than one enabled source accepts local files (" + match + ", " + pkg + "); disable one before opening a bundle");
        match = pkg;
        if (info.version != org.matonos.store.source.ISoftwareSource.VERSION || info.revision < 2)
          throw new IllegalStateException("Flatpak source contract version=" + info.version + " revision=" + info.revision
              + "; local bundles require version=" + org.matonos.store.source.ISoftwareSource.VERSION + " revision 2 or newer");
      }
    }
    if (match == null) throw new IllegalStateException("No enabled source accepts local .flatpak bundles");
    return match;
  }

  public String localBundleName(Uri uri) throws Exception {
    if (uri == null || !"content".equals(uri.getScheme())) throw new IllegalArgumentException("Local bundle must be opened from a content:// URI");
    try (Cursor cursor = context.getContentResolver().query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int column = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
        if (column >= 0) {
          String name = cursor.getString(column);
          if (name != null && !name.trim().isEmpty()) return name;
        }
      }
    }
    String fallback = uri.getLastPathSegment();
    if (fallback == null || fallback.isEmpty()) throw new IllegalStateException("Could not read the .flatpak file name from the document provider");
    return fallback;
  }

  public void installLocalFile(Uri uri, String displayName, boolean allowUnsigned, String operationId) throws Exception {
    String pkg = requireLocalBundleSource();
    if (uri == null || !"content".equals(uri.getScheme())) throw new IllegalArgumentException("Local bundle must be opened from a content:// URI");
    if (displayName == null || displayName.trim().isEmpty()) throw new IllegalArgumentException("Local bundle file name is empty");
    if (!displayName.toLowerCase(java.util.Locale.ROOT).endsWith(".flatpak")) throw new IllegalArgumentException("Only .flatpak bundle files can be opened here: " + displayName);
    ParcelFileDescriptor file = context.getContentResolver().openFileDescriptor(uri, "r");
    if (file == null) throw new IllegalStateException("Document provider returned no file descriptor for " + displayName);
    try {
      invokeInstall(pkg, operationId, null);
      source(pkg).installLocalFile(file, displayName, allowUnsigned, operationId, callback(pkg, displayName));
    } catch (Exception error) { installCallFailed(pkg, operationId, error); }
    finally {
      try { Log.i(TAG, "close fd=" + file.getFd() + " at SourcePlugins.installLocalFile"); file.close(); }
      catch (Exception error) { Log.e(TAG, "Closing local bundle descriptor uri=" + uri + " op=" + operationId + " failed", error); }
    }
  }

  private void invokeInstall(String pkg, String operationId, Ownership owner) {
    uncommittedSessions.remove(operationId);
    if (owner != null) pendingOwners.put(operationId, owner);
    operationSources.put(operationId, pkg);
  }
  private IInstallCallback callback(String pkg, String description) {
    return new IInstallCallback.Stub() {
      @Override public void progress(String op, String phase, int percent, long done, long total) {
        events.progress(pkg, op, phase, percent, done, total);
      }
      @Override public void commit(String op, String packageName, String[] names,
          ParcelFileDescriptor[] files, String[] removeSplits, ICommitResult result) {
        try {
          SourcePlugins.this.commit(pkg, op, packageName, names, files, removeSplits, result);
        } catch (Exception error) {
          Log.e(TAG, pkg + ": committing " + packageName + " failed", error);
          reply(result, false, pkg + ": " + error.getMessage());
        } finally {
          if (files != null) for (ParcelFileDescriptor file : files) if (file != null) {
            try { Log.i(TAG, "close fd=" + file.getFd() + " at SourcePlugins.install.commit"); file.close(); }
            catch (Exception error) { Log.e(TAG, "Closing source APK descriptor op=" + op, error); }
          }
        }
      }
      @Override public void done(String op) {
        operationSources.remove(op);
        Completion completion = completions.remove(op);
        if (completion != null) completion.finish(true, null);
        events.result(pkg, op, true, null);
      }
      @Override public void failed(String op, String error) {
        operationSources.remove(op);
        Log.e(TAG, pkg + ": install " + description + " failed: " + error);
        pendingOwners.remove(op);
        Completion completion = completions.remove(op); if (completion != null) completion.finish(false, error);
        events.result(pkg, op, false, error);
      }
    };
  }
  private void installCallFailed(String pkg, String operationId, Exception error) throws Exception {
      if (error instanceof RemoteException) throw remoteFailure(pkg, error);
      operationSources.remove(operationId); pendingOwners.remove(operationId); completions.remove(operationId);
      throw error;
  }

  /** Stops source work and abandons a session that has not yet been committed. */
  public void cancel(String pkg, String operationId) throws Exception {
    Integer sessionId = uncommittedSessions.remove(operationId);
    if (sessionId != null) {
      try { context.getPackageManager().getPackageInstaller().abandonSession(sessionId); }
      catch (Exception error) { Log.e(TAG, "Abandoning uncommitted session=" + sessionId + " op=" + operationId + " failed", error); }
    }
    try { source(pkg).cancel(operationId); } catch (Exception error) { if (error instanceof RemoteException) throw remoteFailure(pkg, error); throw error; }
  }

  /** Revision 1 keep-alive check. Older sources remain compatible and are treated as running. */
  public boolean running(String pkg, String operationId) throws Exception {
    try {
      ISoftwareSource plugin = source(pkg);
      org.matonos.store.source.types.SourceInfo info = plugin.info();
      if (info.version <= 2 && info.revision < 1) return true;
      return plugin.running(operationId);
    } catch (Exception error) {
      if (error instanceof RemoteException) throw remoteFailure(pkg, error);
      throw error;
    }
  }

  private void commit(String source, String operationId, String packageName, String[] names,
      ParcelFileDescriptor[] files, String[] removeSplits, ICommitResult result) throws Exception {
    int count = files == null ? 0 : files.length;
    if (names == null || names.length != count) throw new IllegalArgumentException("APK names and files do not match");
    if (count == 0 && (removeSplits == null || removeSplits.length == 0)) throw new IllegalArgumentException("Empty commit for " + packageName);
    // No base.apk: change the installed package, keeping its other splits.
    boolean inherit = !Arrays.asList(names).contains("base.apk");
    PackageInstaller installer = context.getPackageManager().getPackageInstaller();
    PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
        inherit ? PackageInstaller.SessionParams.MODE_INHERIT_EXISTING : PackageInstaller.SessionParams.MODE_FULL_INSTALL);
    // PackageInstaller rejects APKs naming another package than this, so a
    // source cannot slip a different app into the session.
    params.setAppPackageName(packageName);
    params.setRequestUpdateOwnership(true);
    int sessionId = installer.createSession(params);
    uncommittedSessions.put(operationId, sessionId);
    try (PackageInstaller.Session session = installer.openSession(sessionId)) {
      for (int i = 0; i < count; i++) {
        if (!names[i].matches("[A-Za-z0-9._-]+\\.apk")) throw new IllegalArgumentException("Invalid APK name " + names[i]);
        try (InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(ParcelFileDescriptor.dup(files[i].getFileDescriptor()));
             OutputStream out = session.openWrite(names[i], 0, files[i].getStatSize())) {
          byte[] buffer = new byte[64 * 1024];
          int read;
          while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
          session.fsync(out);
          Log.i(TAG, "close duplicated APK descriptor at SourcePlugins.commit session=" + sessionId + " name=" + names[i]);
        }
      }
      if (removeSplits != null) for (String split : removeSplits) session.removeSplit(split);
      events.progress(source, operationId, "Installing " + packageName, -1, -1, -1);
      ICommitResult tracked = new ICommitResult.Stub() {
        @Override public void result(boolean ok, String error) {
          if (ok) { Ownership own = pendingOwners.get(operationId); if (own != null) recordOwner(packageName, own); }
          try { result.result(ok, error); } catch (Exception e) { Log.e(TAG, "Relaying commit outcome op=" + operationId + " package=" + packageName + " failed", e); }
        }
      };
      session.commit(resultSender(sessionId, tracked));
      uncommittedSessions.remove(operationId, sessionId);
    } catch (Exception error) {
      uncommittedSessions.remove(operationId, sessionId);
      try { installer.abandonSession(sessionId); } catch (Exception abandon) { Log.e(TAG, "Abandoning session=" + sessionId + " failed", abandon); }
      throw error;
    }
  }

  /** One-shot receiver for a session's terminal status, relayed to the source. */
  private android.content.IntentSender resultSender(int sessionId, ICommitResult result) {
    String action = context.getPackageName() + ".SOURCE_COMMIT." + sessionId;
    context.registerReceiver(new android.content.BroadcastReceiver() {
      @Override public void onReceive(Context ignored, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
          Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
          if (confirm != null) context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
          return;
        }
        context.unregisterReceiver(this);
        boolean ok = status == PackageInstaller.STATUS_SUCCESS;
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (!ok) Log.e(TAG, "Session " + sessionId + " failed: status " + status + " " + message);
        reply(result, ok, ok ? null : (message != null ? message : "Package install failed (status " + status + ")"));
      }
    }, new android.content.IntentFilter(action), Context.RECEIVER_NOT_EXPORTED);
    Intent intent = new Intent(action).setPackage(context.getPackageName());
    return android.app.PendingIntent.getBroadcast(context, sessionId, intent,
        android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE).getIntentSender();
  }

  private static void reply(ICommitResult result, boolean ok, String error) {
    try { result.result(ok, error); } catch (Exception gone) { Log.e(TAG, "Source went away before its commit result", gone); }
  }

  public void uninstall(String source, String packageName, String operationId) {
    context.getPackageManager().getPackageInstaller().uninstall(packageName, events.commitTarget(source, operationId));
  }

  public void close() {
    try { context.unregisterReceiver(packageRemoved); } catch (Exception error) { Log.e(TAG, "Unregistering package removal receiver failed", error); }
    unusedCleanup.shutdownNow();
    for (String pkg : new ArrayList<>(connections.keySet())) disconnect(pkg);
    catalogueIndex.close();
  }

  private void disconnect(String pkg) {
    Connection connection = connections.remove(pkg);
    if (connection != null) try { context.unbindService(connection); } catch (Exception error) { Log.e(TAG, "Unbinding source " + pkg + " failed", error); }
    String label = labels.getOrDefault(pkg, pkg);
    for (Map.Entry<String, String> entry : new ArrayList<>(operationSources.entrySet())) if (pkg.equals(entry.getValue())) {
      String op = entry.getKey();
      if (operationSources.remove(op, pkg)) {
        pendingOwners.remove(op);
        Completion completion = completions.remove(op);
        if (completion != null) completion.finish(false, label + " stopped");
        events.result(pkg, op, false, label + " stopped");
        Log.e(TAG, "Failing in-flight source operation source=" + pkg + " op=" + op + " reason=" + label + " stopped");
      }
    }
  }

  private final class Connection implements ServiceConnection {
    final CountDownLatch ready = new CountDownLatch(1);
    volatile IBinder binder;
    @Override public void onServiceConnected(ComponentName name, IBinder service) { binder = service; ready.countDown(); }
    @Override public void onServiceDisconnected(ComponentName name) { Log.e(TAG, "Source disconnected: " + name); binder = null; disconnect(name.getPackageName()); }
    @Override public void onBindingDied(ComponentName name) { Log.e(TAG, "Source binding died: " + name); binder = null; disconnect(name.getPackageName()); }
  }
}
