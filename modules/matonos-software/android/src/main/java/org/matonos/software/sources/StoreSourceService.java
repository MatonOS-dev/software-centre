package org.matonos.software.sources;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;
import org.matonos.store.source.ICommitResult;
import org.matonos.store.source.IStore;
import java.util.concurrent.atomic.AtomicLong;

/** Store contract endpoint used by enabled source plugins for dependency repair. */
public final class StoreSourceService extends Service {
  private static final String TAG = "StoreSourceService";
  private final AtomicLong sequence = new AtomicLong();
  private SourcePlugins plugins;
  @Override public void onCreate() {
    super.onCreate();
    plugins = new SourcePlugins(this, new SourcePlugins.Events() {
      public void progress(String s, String o, String p, int n, long d, long t) {}
      public void result(String s, String o, boolean ok, String e) {}
      public android.content.IntentSender commitTarget(String s, String o) { return null; }
    });
  }
  @Override public IBinder onBind(Intent intent) {
    if (!"org.matonos.store.STORE".equals(intent.getAction())) return null;
    return new IStore.Stub() {
      @Override public void update(String id, ICommitResult result) {
        String[] callers = getPackageManager().getPackagesForUid(android.os.Binder.getCallingUid());
        if (callers == null) { reply(result, false, "Calling package is unavailable"); return; }
        String caller = null;
        for (String candidate : callers) for (java.util.Map<String,Object> row : plugins.list())
          if (candidate.equals(row.get("package")) && Boolean.TRUE.equals(row.get("enabled"))) caller = candidate;
        if (caller == null) { reply(result, false, "Calling source is not enabled"); return; }
        SourcePlugins.Ownership found = null;
        for (android.content.pm.ApplicationInfo app : getPackageManager().getInstalledApplications(0)) {
          SourcePlugins.Ownership own = plugins.owner(app.packageName);
          if (own != null && own.source.equals(caller) && own.id.equals(id)) { found = own; break; }
        }
        if (found == null) { reply(result, false, "App is not installed from this source"); return; }
        try { plugins.update(caller, id, found.repo, "store-update-" + sequence.incrementAndGet(), (ok, error) -> reply(result, ok, error)); }
        catch (Exception e) { Log.e(TAG, "Update request failed source=" + caller + " id=" + id, e); reply(result, false, e.getMessage()); }
      }
    };
  }
  private static void reply(ICommitResult result, boolean ok, String reason) {
    try { result.result(ok, reason); } catch (Exception e) { Log.e(TAG, "Returning update result failed", e); }
  }
}
