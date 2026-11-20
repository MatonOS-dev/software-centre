package org.matonos.software.sources;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import com.google.gson.JsonParser;
import com.google.gson.stream.JsonReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Store-owned streaming SQLite catalogue index. */
final class CatalogueIndex extends SQLiteOpenHelper {
  private static final String TAG="StoreCatalogue";
  private static final String DB="store-catalogue.db";
  CatalogueIndex(Context context){super(context,DB,null,1);}
  @Override public void onCreate(SQLiteDatabase db){
    db.execSQL("CREATE TABLE apps(source TEXT NOT NULL,id TEXT NOT NULL,repo TEXT NOT NULL,name TEXT,summary TEXT,icon TEXT,developer TEXT,added INTEGER,popularity REAL,installed INTEGER,updates INTEGER,installable INTEGER,repo_priority INTEGER,repo_label TEXT,raw TEXT NOT NULL,PRIMARY KEY(source,id,repo))");
    db.execSQL("CREATE VIRTUAL TABLE apps_fts USING fts4(source,id,repo,name,summary,tokenize=unicode61)");
    db.execSQL("CREATE TABLE generations(source TEXT PRIMARY KEY,generation INTEGER NOT NULL)");
    db.execSQL("CREATE INDEX apps_source_id ON apps(source,id)");db.execSQL("CREATE INDEX apps_source_added ON apps(source,added DESC)");db.execSQL("CREATE INDEX apps_source_popular ON apps(source,popularity DESC)");
  }
  @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){throw new IllegalStateException("Unsupported store catalogue DB upgrade "+oldVersion+" -> "+newVersion);}

  synchronized void importIfChanged(String source,long version,ParcelFileDescriptor descriptor) throws Exception {
    SQLiteDatabase db=getWritableDatabase();
    try(Cursor c=db.rawQuery("SELECT generation FROM generations WHERE source=?",new String[]{source})) {
      if(c.moveToFirst()&&c.getLong(0)==version){descriptor.close();return;}
    }
    db.beginTransaction();
    try(JsonReader reader=new JsonReader(new InputStreamReader(new ParcelFileDescriptor.AutoCloseInputStream(descriptor),StandardCharsets.UTF_8))){
      String declaredSource=null;int format=-1;boolean apps=false;reader.beginObject();
      while(reader.hasNext()){
        String key=reader.nextName();
        if(key.equals("format"))format=reader.nextInt();
        else if(key.equals("source"))declaredSource=reader.nextString();
        else if(key.equals("generated"))reader.skipValue();
        else if(key.equals("apps")){
          apps=true;db.delete("apps", "source=?",new String[]{source});db.delete("apps_fts","source=?",new String[]{source});reader.beginArray();
          while(reader.hasNext()){
            String raw=JsonParser.parseReader(reader).toString();JSONObject row=new JSONObject(raw);
            if(!row.optString("id").isEmpty()&&!row.optString("repo","1").isEmpty())insertRow(db,source,row,raw);
          }
          reader.endArray();
        } else reader.skipValue();
      }
      reader.endObject();
      if(format!=1||!source.equals(declaredSource)||!apps)throw new IllegalArgumentException("Invalid catalogue header from "+source);
      ContentValues value=new ContentValues();value.put("source",source);value.put("generation",version);db.insertWithOnConflict("generations",null,value,SQLiteDatabase.CONFLICT_REPLACE);
      db.setTransactionSuccessful();
    } catch(Exception error){Log.e(TAG,"Import catalogue failed source="+source+" generation="+version,error);throw error;}
    finally{db.endTransaction();}
  }
  private static void insertRow(SQLiteDatabase db,String source,JSONObject row,String raw)throws Exception{
    String id=row.getString("id"),repo=row.optString("repo","1");ContentValues v=new ContentValues();v.put("source",source);v.put("id",id);v.put("repo",repo);v.put("name",row.optString("name"));v.put("summary",row.optString("summary"));v.put("icon",row.optString("icon"));v.put("developer",row.optString("developer"));v.put("added",row.optLong("added"));v.put("popularity",row.optDouble("popularityScore",0));v.put("installed",row.optBoolean("installed")?1:0);v.put("updates",row.optBoolean("updateAvailable")?1:0);v.put("installable",row.optBoolean("installable",true)?1:0);v.put("repo_priority",row.optInt("repoPriority",0));v.put("repo_label",row.optString("repoLabel",repo));v.put("raw",raw);long rowId=db.insertOrThrow("apps",null,v);
    ContentValues f=new ContentValues();f.put("source",source);f.put("id",id);f.put("repo",repo);f.put("name",row.optString("name"));f.put("summary",row.optString("summary"));db.execSQL("INSERT INTO apps_fts(rowid,source,id,repo,name,summary) VALUES(?,?,?,?,?,?)",new Object[]{rowId,source,id,repo,row.optString("name"),row.optString("summary")});
  }
  synchronized String query(String source,String kind,String term,int offset,int limit)throws Exception{
    if(offset<0||limit<1)throw new IllegalArgumentException("offset must be non-negative and limit positive");
    SQLiteDatabase db=getReadableDatabase();String selection="a.source=? AND a.rowid=(SELECT b.rowid FROM apps b WHERE b.source=a.source AND b.id=a.id ORDER BY b.installable DESC,b.repo_priority DESC,b.repo_label COLLATE NOCASE LIMIT 1)",order="a.name COLLATE NOCASE,a.repo";String[] args;
    if("search".equals(kind)&&term!=null&&!term.trim().isEmpty()){
      // Each word is a quoted prefix token ("ari*"), so user punctuation cannot become FTS
      // syntax and partial words match while typing.
      StringBuilder fts=new StringBuilder();
      for(String word:term.trim().split("\\s+")){if(fts.length()>0)fts.append(' ');fts.append('"').append(word.replace("\"","\"\"")).append("*\"");}
      String escaped=fts.toString();selection+=" AND a.rowid IN (SELECT rowid FROM apps_fts WHERE apps_fts MATCH ? AND source=?)";args=new String[]{source,escaped,source};
    }else args=new String[]{source};
    if("popular".equals(kind))order="a.popularity DESC,a.name COLLATE NOCASE";
    else if("new".equals(kind))order="a.added DESC,a.name COLLATE NOCASE";
    else if("installed".equals(kind))selection+=" AND a.installed=1";
    else if("updates".equals(kind))selection+=" AND a.updates=1";
    else if(!"search".equals(kind))throw new IllegalArgumentException("Unknown catalogue query "+kind);
    org.json.JSONArray result=new org.json.JSONArray();
    try(Cursor c=db.rawQuery("SELECT a.id,a.raw FROM apps a WHERE "+selection+" ORDER BY "+order+" LIMIT ? OFFSET ?",append(args,new String[]{String.valueOf(limit),String.valueOf(offset)}))){while(c.moveToNext()){
      JSONObject row=new JSONObject(c.getString(1));org.json.JSONArray options=new org.json.JSONArray();
      try(Cursor repos=db.rawQuery("SELECT repo,repo_label,installable FROM apps WHERE source=? AND id=? ORDER BY repo_priority DESC,repo_label COLLATE NOCASE",new String[]{source,c.getString(0)})){
        while(repos.moveToNext()){JSONObject option=new JSONObject().put("repoId",repos.getString(0)).put("name",repos.getString(1)).put("installable",repos.getInt(2)!=0);if(repos.getInt(2)==0)option.put("note","Different signing key");options.put(option);}
      }
      row.put("repoOptions",options);result.put(row);
    }}
    return result.toString();
  }
  synchronized String repositories(String source)throws Exception{
    org.json.JSONArray result=new org.json.JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT repo,MAX(repo_priority) priority,MAX(repo_label) label FROM apps WHERE source=? GROUP BY repo ORDER BY priority DESC,label COLLATE NOCASE",new String[]{source})){while(c.moveToNext())result.put(new JSONObject().put("id",c.getString(0)).put("label",c.getString(2)));}return result.toString();
  }
  private static String[] append(String[] a,String[] b){String[] out=new String[a.length+b.length];System.arraycopy(a,0,out,0,a.length);System.arraycopy(b,0,out,a.length,b.length);return out;}
}
