package in.hcworks.leos.lan.ui;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.google.android.material.snackbar.Snackbar;
import com.google.android.material.textfield.MaterialAutoCompleteTextView;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;

import in.hcworks.leos.lan.LeosApi;
import in.hcworks.leos.lan.R;

public final class MainActivity extends Activity {
    private final LeosApi api = new LeosApi();
    private FrameLayout content;
    private MaterialToolbar toolbar;
    private BottomNavigationView navigation;
    private String serverUrl = "";
    private String pairingCode = "";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        content = findViewById(R.id.content);
        toolbar = findViewById(R.id.top_app_bar);
        navigation = findViewById(R.id.navigation);
        serverUrl = getPreferences(MODE_PRIVATE).getString("server", "");
        pairingCode = getPreferences(MODE_PRIVATE).getString("pairing", "");
        navigation.setOnItemSelectedListener(item -> {
            if (item.getItemId() == R.id.nav_home) showHome();
            else if (item.getItemId() == R.id.nav_students) showList("Students", "/students?limit=100", "students");
            else if (item.getItemId() == R.id.nav_attendance) showAttendance();
            else showMore();
            return true;
        });
        showConnection();
    }

    private void showConnection() {
        Page p = page("Connect to LEOS", false, false);
        p.subtitle("Use the address and temporary pairing code shown on the main school computer.");
        TextInputEditText server = p.field("Server address", "http://192.168.1.20:8788", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        server.setText(serverUrl);
        TextInputEditText code = p.field("Pairing code", "Temporary code", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        code.setText(pairingCode);
        p.primary("Connect", v -> {
            serverUrl = value(server);
            pairingCode = value(code);
            if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) serverUrl = "http://" + serverUrl;
            api.configure(serverUrl, pairingCode);
            p.loading(true);
            api.get("/health", (status, body, error) -> runOnUiThread(() -> {
                p.loading(false);
                if (status == 200) {
                    getPreferences(MODE_PRIVATE).edit().putString("server", serverUrl).putString("pairing", pairingCode).apply();
                    showLogin();
                } else notify(error(status, body, error));
            }));
        });
    }

    private void showLogin() {
        Page p = page("Sign in", false, false);
        p.subtitle("Connected to " + serverUrl);
        TextInputEditText username = p.field("Username", "School account", InputType.TYPE_CLASS_TEXT);
        TextInputEditText password = p.field("Password", "Password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        p.primary("Sign in", v -> {
            JSONObject body = json("username", value(username), "password", value(password));
            p.loading(true);
            api.post("/auth/login", body, (status, result, error) -> runOnUiThread(() -> {
                p.loading(false);
                if (status == 200) {
                    api.setToken(result.optString("token"));
                    navigation.setSelectedItemId(R.id.nav_home);
                    showHome();
                } else notify(error(status, result, error));
            }));
        });
        p.tonal("Change server", v -> showConnection());
    }

    private void showHome() {
        Page p = page("Daily workspace", false, true);
        p.subtitle("Today’s teaching and school activity at a glance.");
        p.actionCard("Today’s timetable", "Classes, periods and rooms", v -> showList("Today’s timetable", "/timetable/day", null));
        p.actionCard("Faculty planning", "Daily, weekly and monthly lesson plans", v -> showPlans());
        p.actionCard("Learning spaces", "Courses, lessons and submissions", v -> showList("Learning spaces", "/lms/spaces", "spaces"));
        p.actionCard("Tasks", "Assigned and upcoming work", v -> showList("Tasks", "/tasks", "tasks"));
    }

    private void showMore() {
        Page p = page("More", false, true);
        p.actionCard("Faculty plans", "Create and review teaching plans", v -> showPlans());
        p.actionCard("Learning spaces", "Courses and class learning resources", v -> showList("Learning spaces", "/lms/spaces", "spaces"));
        p.actionCard("Tasks", "Assigned work", v -> showList("Tasks", "/tasks", "tasks"));
        p.actionCard("Reminders", "Important dates and follow-ups", v -> showList("Reminders", "/reminders", "reminders"));
        p.actionCard("Today’s timetable", "Daily class schedule", v -> showList("Today’s timetable", "/timetable/day", null));
        p.tonal("Sign out", v -> api.post("/auth/logout", new JSONObject(), (status, body, error) -> runOnUiThread(() -> {
            api.setToken("");
            showLogin();
        })));
        p.textButton("Change server", v -> showConnection());
    }

    private void showAttendance() {
        Page p = page("Attendance", false, true);
        p.subtitle("Record a student’s attendance for the selected date.");
        TextInputEditText student = p.field("Student ID", "Numeric ID", InputType.TYPE_CLASS_NUMBER);
        TextInputEditText date = p.field("Date", "YYYY-MM-DD", InputType.TYPE_CLASS_DATETIME);
        date.setText(LocalDate.now().toString());
        MaterialAutoCompleteTextView status = p.dropdown("Status", new String[]{"Present", "Absent", "Late", "Excused"});
        p.primary("Save attendance", v -> {
            int studentId;
            try { studentId = Integer.parseInt(value(student)); }
            catch (Exception ex) { notify("Enter a valid student ID"); return; }
            JSONObject body = json("student_id", studentId, "date", value(date), "status", value(status).toLowerCase());
            p.loading(true);
            api.post("/attendance/mark", body, (code, result, error) -> runOnUiThread(() -> {
                p.loading(false);
                notify(code < 300 ? "Attendance saved" : error(code, result, error));
            }));
        });
        p.tonal("View selected date", v -> showList("Attendance", "/attendance?date=" + value(date), "attendance"));
    }

    private void showPlans() {
        Page p = page("Faculty planning", true, false);
        p.subtitle("Prepare a printable teaching plan for manual faculty records.");
        MaterialAutoCompleteTextView period = p.dropdown("Plan period", new String[]{"Daily", "Weekly", "Monthly"});
        TextInputEditText title = p.field("Title", "Plan title", InputType.TYPE_CLASS_TEXT);
        TextInputEditText start = p.field("Start date", "YYYY-MM-DD", InputType.TYPE_CLASS_DATETIME);
        TextInputEditText end = p.field("End date", "YYYY-MM-DD", InputType.TYPE_CLASS_DATETIME);
        TextInputEditText lessons = p.field("Lessons", "Lesson coverage", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        TextInputEditText activities = p.field("Activities", "Learning activities", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        start.setText(LocalDate.now().toString()); end.setText(LocalDate.now().toString());
        p.primary("Create plan", v -> {
            JSONObject body = json("period_type", value(period).toLowerCase(), "title", value(title), "start_date", value(start), "end_date", value(end), "lessons", value(lessons), "activities", value(activities));
            p.loading(true);
            api.post("/faculty-plans", body, (code, result, error) -> runOnUiThread(() -> {
                p.loading(false);
                notify(code < 300 ? "Plan created" : error(code, result, error));
            }));
        });
        p.tonal("View plans", v -> showList("Faculty plans", "/faculty-plans", "plans"));
    }

    private void showList(String title, String path, String key) {
        Page p = page(title, true, false);
        p.loading(true);
        api.get(path, (status, body, error) -> runOnUiThread(() -> {
            p.loading(false);
            if (status != 200) { p.supporting(error(status, body, error)); return; }
            JSONArray rows = key == null ? null : body.optJSONArray(key);
            if (rows == null) { p.dataCard(title, body.toString()); return; }
            if (rows.length() == 0) { p.supporting("No records found"); return; }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                String label = row.optString("title", row.optString("name", row.optString("first_name", "Record " + row.optInt("id"))));
                String detail = row.optString("last_name", row.optString("status", row.optString("description", "")));
                p.dataCard(label, detail);
            }
        }));
    }

    private Page page(String title, boolean back, boolean showNavigation) {
        toolbar.setTitle(title);
        if (back) toolbar.setNavigationIcon(android.R.drawable.ic_media_previous);
        else toolbar.setNavigationIcon((android.graphics.drawable.Drawable) null);
        toolbar.setNavigationOnClickListener(back ? v -> navigation.setSelectedItemId(R.id.nav_more) : null);
        toolbar.setVisibility(View.VISIBLE);
        navigation.setVisibility(showNavigation ? View.VISIBLE : View.GONE);
        Page page = new Page();
        content.removeAllViews();
        content.addView(page.root);
        return page;
    }

    private void notify(String message) { Snackbar.make(content, message == null ? "Request failed" : message, Snackbar.LENGTH_LONG).show(); }
    private String error(int status, JSONObject body, Exception exception) { return exception != null ? exception.getMessage() : body.optString("error", "Request failed (HTTP " + status + ")"); }
    private static String value(TextView view) { return view.getText() == null ? "" : view.getText().toString().trim(); }
    private static JSONObject json(Object... values) { JSONObject result = new JSONObject(); try { for (int i = 0; i < values.length; i += 2) result.put(String.valueOf(values[i]), values[i + 1]); } catch (Exception ignored) {} return result; }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density); }

    private final class Page {
        final ScrollView root = new ScrollView(MainActivity.this);
        final LinearLayout body = new LinearLayout(MainActivity.this);
        final LinearProgressIndicator progress = new LinearProgressIndicator(MainActivity.this);
        Page() {
            body.setOrientation(LinearLayout.VERTICAL);
            body.setPadding(dp(20), dp(16), dp(20), dp(32));
            progress.setIndeterminate(true); progress.setVisibility(View.GONE);
            body.addView(progress, match()); root.addView(body);
        }
        void loading(boolean active) { progress.setVisibility(active ? View.VISIBLE : View.GONE); }
        void subtitle(String text) { TextView view = label(text, 16, false); view.setTextColor(getColor(com.google.android.material.R.color.material_on_surface_emphasis_medium)); body.addView(view, spaced()); }
        void supporting(String text) { TextView view = label(text, 15, false); view.setGravity(Gravity.CENTER); body.addView(view, spaced()); }
        TextInputEditText field(String label, String hint, int inputType) {
            TextInputLayout layout = new TextInputLayout(MainActivity.this, null, com.google.android.material.R.attr.textInputOutlinedStyle);
            layout.setHint(label); layout.setPlaceholderText(hint); layout.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
            TextInputEditText input = new TextInputEditText(layout.getContext()); input.setInputType(inputType); input.setMinLines((inputType & InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0 ? 3 : 1);
            layout.addView(input, match()); body.addView(layout, spaced()); return input;
        }
        MaterialAutoCompleteTextView dropdown(String label, String[] options) {
            TextInputLayout layout = new TextInputLayout(MainActivity.this, null, com.google.android.material.R.attr.textInputOutlinedStyle);
            layout.setHint(label); layout.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE); layout.setEndIconMode(TextInputLayout.END_ICON_DROPDOWN_MENU);
            MaterialAutoCompleteTextView input = new MaterialAutoCompleteTextView(layout.getContext()); input.setAdapter(new ArrayAdapter<>(MainActivity.this, android.R.layout.simple_list_item_1, options)); input.setText(options[0], false); input.setInputType(InputType.TYPE_NULL);
            layout.addView(input, match()); body.addView(layout, spaced()); return input;
        }
        void primary(String text, View.OnClickListener listener) { button(text, com.google.android.material.R.attr.materialButtonStyle, listener); }
        void tonal(String text, View.OnClickListener listener) { button(text, com.google.android.material.R.attr.materialButtonOutlinedStyle, listener); }
        void textButton(String text, View.OnClickListener listener) { button(text, com.google.android.material.R.attr.materialButtonOutlinedStyle, listener); }
        void button(String text, int style, View.OnClickListener listener) { MaterialButton button = new MaterialButton(MainActivity.this, null, style); button.setText(text); button.setOnClickListener(listener); body.addView(button, spaced()); }
        void actionCard(String title, String detail, View.OnClickListener listener) {
            MaterialCardView card = new MaterialCardView(MainActivity.this); card.setClickable(true); card.setFocusable(true); card.setOnClickListener(listener); card.setCardElevation(0); card.setStrokeWidth(dp(1));
            LinearLayout inside = new LinearLayout(MainActivity.this); inside.setOrientation(LinearLayout.VERTICAL); inside.setPadding(dp(18), dp(14), dp(18), dp(14)); inside.addView(label(title, 17, true)); inside.addView(label(detail, 14, false)); card.addView(inside); body.addView(card, spaced());
        }
        void dataCard(String title, String detail) {
            MaterialCardView card = new MaterialCardView(MainActivity.this); card.setCardElevation(0);
            LinearLayout inside = new LinearLayout(MainActivity.this); inside.setOrientation(LinearLayout.VERTICAL); inside.setPadding(dp(18), dp(14), dp(18), dp(14)); inside.addView(label(title, 16, true)); if (!detail.isEmpty()) inside.addView(label(detail, 14, false)); card.addView(inside); body.addView(card, spaced());
        }
        TextView label(String text, int size, boolean bold) { TextView view = new TextView(MainActivity.this); view.setText(text); view.setTextSize(size); if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return view; }
        LinearLayout.LayoutParams match() { return new LinearLayout.LayoutParams(-1, -2); }
        LinearLayout.LayoutParams spaced() { LinearLayout.LayoutParams params = match(); params.setMargins(0, dp(6), 0, dp(6)); return params; }
    }
}
