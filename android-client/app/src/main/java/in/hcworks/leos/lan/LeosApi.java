package in.hcworks.leos.lan;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public final class LeosApi {
    public interface Callback { void done(int status, JSONObject body, Exception error); }
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private String baseUrl = "", pairingCode = "", token = "";
    public void configure(String url, String code) { baseUrl=url.replaceAll("/+$",""); pairingCode=code.trim().toUpperCase(); }
    public void setToken(String value) { token=value==null?"":value; }
    public void get(String path, Callback cb) { request("GET",path,null,cb); }
    public void post(String path, JSONObject body, Callback cb) { request("POST",path,body,cb); }
    private void request(String method,String path,JSONObject body,Callback cb) {
        executor.execute(() -> { HttpURLConnection c=null; try {
            c=(HttpURLConnection)new URL(baseUrl+path).openConnection(); c.setRequestMethod(method); c.setConnectTimeout(7000); c.setReadTimeout(15000);
            c.setRequestProperty("Accept","application/json"); c.setRequestProperty("Content-Type","application/json"); c.setRequestProperty("X-LEOS-Pairing-Code",pairingCode); c.setRequestProperty("User-Agent","LEOS-Android/0.5 Carbon-Theme");
            if(!token.isEmpty()) c.setRequestProperty("Authorization","Bearer "+token);
            if(body!=null){c.setDoOutput(true);c.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));}
            int status=c.getResponseCode(); InputStream stream=status>=400?c.getErrorStream():c.getInputStream(); StringBuilder text=new StringBuilder();
            if(stream!=null)try(BufferedReader r=new BufferedReader(new InputStreamReader(stream,StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null)text.append(line);}
            cb.done(status,text.length()==0?new JSONObject():new JSONObject(text.toString()),null);
        }catch(Exception e){cb.done(0,new JSONObject(),e);}finally{if(c!=null)c.disconnect();} });
    }
}
