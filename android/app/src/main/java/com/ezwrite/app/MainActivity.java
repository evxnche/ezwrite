package com.ezwrite.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String PREFS_NAME = "ezwrite";
    private static final String PAGE_KEY_PREFIX = "page_";
    private static final String PAGE_COUNT_KEY = "page_count";
    private static final String CURRENT_PAGE_KEY = "current_page";
    private static final int DEFAULT_PAGE_COUNT = 3;

    private final Handler timerHandler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private EditText editor;
    private TextView pageLabel;
    private TextView timerLabel;
    private Button timerButton;
    private int currentPage = 0;
    private int pageCount = DEFAULT_PAGE_COUNT;
    private boolean loadingPage = false;
    private boolean timerRunning = false;
    private long timerStartedAt = 0L;
    private long elapsedBeforeStart = 0L;

    private final Runnable timerTick = new Runnable() {
        @Override
        public void run() {
            updateTimerLabel();
            if (timerRunning) {
                timerHandler.postDelayed(this, 1000);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        pageCount = Math.max(DEFAULT_PAGE_COUNT, prefs.getInt(PAGE_COUNT_KEY, DEFAULT_PAGE_COUNT));
        currentPage = Math.min(prefs.getInt(CURRENT_PAGE_KEY, 0), pageCount - 1);

        setContentView(createLayout());
        loadPage(currentPage);
    }

    private View createLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(23, 23, 23));
        root.setPadding(dp(16), dp(18), dp(16), dp(10));

        TextView title = new TextView(this);
        title.setText("ezwrite");
        title.setTextColor(Color.rgb(245, 245, 245));
        title.setTextSize(24);
        root.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        pageLabel = new TextView(this);
        pageLabel.setTextColor(Color.rgb(180, 180, 180));
        pageLabel.setTextSize(13);
        pageLabel.setPadding(0, dp(2), 0, dp(12));
        root.addView(pageLabel);

        editor = new EditText(this);
        editor.setGravity(Gravity.TOP | Gravity.START);
        editor.setMinLines(12);
        editor.setTextColor(Color.rgb(245, 245, 245));
        editor.setHintTextColor(Color.rgb(130, 130, 130));
        editor.setTextSize(18);
        editor.setHint("Start writing...");
        editor.setBackgroundColor(Color.TRANSPARENT);
        editor.setSingleLine(false);
        editor.setPadding(0, dp(8), 0, dp(8));
        editor.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                if (!loadingPage) {
                    saveCurrentPage();
                }
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });

        root.addView(editor, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER_VERTICAL);

        Button previousButton = makeButton("Prev");
        previousButton.setOnClickListener(v -> goToPage(Math.max(0, currentPage - 1)));
        controls.addView(previousButton);

        Button nextButton = makeButton("Next");
        nextButton.setOnClickListener(v -> goToPage(Math.min(pageCount - 1, currentPage + 1)));
        controls.addView(nextButton);

        Button addButton = makeButton("New");
        addButton.setOnClickListener(v -> {
            saveCurrentPage();
            pageCount += 1;
            prefs.edit().putInt(PAGE_COUNT_KEY, pageCount).apply();
            goToPage(pageCount - 1);
        });
        controls.addView(addButton);

        Button shareButton = makeButton("Share");
        shareButton.setOnClickListener(v -> shareCurrentPage());
        controls.addView(shareButton);

        timerButton = makeButton("Start");
        timerButton.setOnClickListener(v -> toggleTimer());
        controls.addView(timerButton);

        root.addView(controls, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        timerLabel = new TextView(this);
        timerLabel.setTextColor(Color.rgb(180, 180, 180));
        timerLabel.setTextSize(13);
        timerLabel.setGravity(Gravity.CENTER);
        timerLabel.setPadding(0, dp(8), 0, 0);
        root.addView(timerLabel);

        updateTimerLabel();
        return root;
    }

    private Button makeButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        return button;
    }

    private void goToPage(int page) {
        if (page == currentPage) return;
        saveCurrentPage();
        currentPage = page;
        prefs.edit().putInt(CURRENT_PAGE_KEY, currentPage).apply();
        loadPage(currentPage);
    }

    private void loadPage(int page) {
        loadingPage = true;
        editor.setText(prefs.getString(PAGE_KEY_PREFIX + page, ""));
        editor.setSelection(editor.getText().length());
        loadingPage = false;
        pageLabel.setText("Page " + (page + 1) + " of " + pageCount);
    }

    private void saveCurrentPage() {
        prefs.edit()
                .putString(PAGE_KEY_PREFIX + currentPage, editor.getText().toString())
                .putInt(CURRENT_PAGE_KEY, currentPage)
                .putInt(PAGE_COUNT_KEY, pageCount)
                .apply();
    }

    private void shareCurrentPage() {
        saveCurrentPage();
        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_SUBJECT, "ezwrite page " + (currentPage + 1));
        sendIntent.putExtra(Intent.EXTRA_TEXT, editor.getText().toString());
        startActivity(Intent.createChooser(sendIntent, "Share ezwrite page"));
    }

    private void toggleTimer() {
        if (timerRunning) {
            elapsedBeforeStart += System.currentTimeMillis() - timerStartedAt;
            timerRunning = false;
            timerButton.setText("Start");
            updateTimerLabel();
            return;
        }

        timerStartedAt = System.currentTimeMillis();
        timerRunning = true;
        timerButton.setText("Stop");
        timerHandler.post(timerTick);
    }

    private void updateTimerLabel() {
        long elapsed = elapsedBeforeStart;
        if (timerRunning) {
            elapsed += System.currentTimeMillis() - timerStartedAt;
        }

        long totalSeconds = elapsed / 1000;
        long minutes = totalSeconds / 60;
        long seconds = totalSeconds % 60;
        timerLabel.setText(String.format("Timer %02d:%02d", minutes, seconds));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onPause() {
        super.onPause();
        saveCurrentPage();
    }

    @Override
    protected void onDestroy() {
        timerHandler.removeCallbacks(timerTick);
        super.onDestroy();
    }
}
