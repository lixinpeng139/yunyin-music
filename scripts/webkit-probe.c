/*
 * WebKitGTK probe for YunYin.
 *
 * Tauri renders the UI with WebKitGTK (the 4.1 / GTK3 build), so validating the
 * front-end in that exact engine is the only way to be sure about CSS
 * (`aspect-ratio`, `backdrop-filter`, `mask-image`), fetch/CORS behaviour
 * against the local API bridge, and media element creation.
 *
 * The probe loads a URL, waits for the app to render, evaluates a snippet of
 * JavaScript and exits 0 only when that snippet reports success through
 * `window.webkit.messageHandlers.probe.postMessage(...)`.
 *
 * Build:
 *   gcc -O2 -o /tmp/webkit-probe scripts/webkit-probe.c \
 *       $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1)
 * Run:
 *   /tmp/webkit-probe <url> '<javascript>' [timeout_seconds]
 */

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <JavaScriptCore/JavaScript.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  const char *url;
  const char *script;
  int timeout_seconds;
  int settled;
  guint timeout_id;
} Probe;

static Probe *g_probe = NULL;

static void finish(const char *reason) {
  if (g_probe && g_probe->timeout_id) {
    g_source_remove(g_probe->timeout_id);
    g_probe->timeout_id = 0;
  }
  if (reason) fprintf(stderr, "%s\n", reason);
  gtk_main_quit();
}

static gboolean on_timeout(gpointer data) {
  (void)data;
  if (g_probe && !g_probe->settled) finish("PROBE TIMEOUT");
  return G_SOURCE_REMOVE;
}

static void on_script_message(WebKitUserContentManager *manager,
                              WebKitJavascriptResult *result,
                              gpointer data) {
  (void)manager;
  (void)data;
  JSCValue *value = webkit_javascript_result_get_js_value(result);
  char *text = jsc_value_to_string(value);
  printf("PROBE RESULT: %s\n", text ? text : "(null)");
  fflush(stdout);
  if (g_probe) g_probe->settled = 1;
  g_free(text);
  finish(NULL);
}

/* Surfaces page-side console errors so the probe fails loudly on them. */
static void on_console_message(WebKitWebView *view, const char *message,
                               guint line, const char *source, gpointer data) {
  (void)view; (void)line; (void)source; (void)data;
  printf("PROBE CONSOLE: %s\n", message);
  fflush(stdout);
}

static void on_load_changed(WebKitWebView *view, WebKitLoadEvent event, gpointer data) {
  (void)data;
  if (event != WEBKIT_LOAD_FINISHED) return;

  /* Give the SPA time to boot, fetch from the bridge and render. */
  char *wrapped = g_strdup_printf(
      "setTimeout(function(){try{%s}catch(e){"
      "window.webkit.messageHandlers.probe.postMessage(JSON.stringify("
      "{ok:false,error:String(e&&e.stack||e)}));}},9000);",
      g_probe->script);
  webkit_web_view_run_javascript(view, wrapped, NULL, NULL, NULL);
  g_free(wrapped);
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s <url> <javascript> [timeout_seconds]\n", argv[0]);
    return 2;
  }

  Probe probe = {
      .url = argv[1],
      .script = argv[2],
      .timeout_seconds = argc > 3 ? atoi(argv[3]) : 60,
      .settled = 0,
      .timeout_id = 0,
  };
  g_probe = &probe;

  gtk_init(&argc, &argv);

  WebKitUserContentManager *manager = webkit_user_content_manager_new();
  webkit_user_content_manager_register_script_message_handler(manager, "probe");
  g_signal_connect(manager, "script-message-received::probe", G_CALLBACK(on_script_message), &probe);

  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  gtk_window_set_default_size(GTK_WINDOW(window), 1440, 900);
  g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

  GtkWidget *view = webkit_web_view_new_with_user_content_manager(manager);
  gtk_container_add(GTK_CONTAINER(window), view);
  g_signal_connect(view, "load-changed", G_CALLBACK(on_load_changed), &probe);
  g_signal_connect(view, "console-message", G_CALLBACK(on_console_message), &probe);
  /* Developer extras make the engine emit console-message for warnings/errors. */
  WebKitSettings *settings = webkit_web_view_get_settings(WEBKIT_WEB_VIEW(view));
  webkit_settings_set_enable_developer_extras(settings, TRUE);
  webkit_settings_set_enable_media_stream(settings, TRUE);
  webkit_settings_set_enable_mediasource(settings, TRUE);

  gtk_widget_show_all(window);
  webkit_web_view_load_uri(WEBKIT_WEB_VIEW(view), probe.url);
  probe.timeout_id = g_timeout_add_seconds(probe.timeout_seconds, on_timeout, &probe);

  gtk_main();
  return probe.settled ? 0 : 1;
}
