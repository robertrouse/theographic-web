package bible.viz.theographic;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        bridge.setWebViewClient(new StaticSiteWebViewClient(bridge));
    }

    /**
     * Serves the prerendered site from the bundle the way Netlify does.
     *
     * Capacitor's local server is written for single-page apps: with
     * `html5mode` (the default) every extension-less path
     * (`/person/moses_2108`, `/browse/`) is answered with the ROOT
     * `index.html`, so a multi-page site would show the home page for every
     * link. The web build is `format: 'directory'` — each page is
     * `<path>/index.html` — so requests for a page are rewritten to that
     * file before the server sees them. The root stays `/`, which the
     * server already maps to `index.html`; a path that is not a page gets
     * `/404.html`, the site's own not-found page. `RouteProcessor` cannot
     * do this: the server hands it the literal `/index.html`, never the
     * requested path.
     */
    static final class StaticSiteWebViewClient extends BridgeWebViewClient {

        private final Bridge bridge;

        StaticSiteWebViewClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String path = url.getPath();
            if (
                path != null &&
                !path.equals("/") &&
                bridge.getLocalUrl() != null &&
                url.toString().startsWith(bridge.getLocalUrl()) &&
                !lastSegmentHasExtension(path)
            ) {
                String trimmed = path;
                while (trimmed.endsWith("/")) trimmed = trimmed.substring(0, trimmed.length() - 1);
                String page = trimmed + "/index.html";
                if (!pageExists(page)) page = "/404.html";
                Uri rewritten = url.buildUpon().path(page).build();
                return super.shouldInterceptRequest(view, new RewrittenRequest(request, rewritten));
            }
            return super.shouldInterceptRequest(view, request);
        }

        private static boolean lastSegmentHasExtension(String path) {
            int slash = path.lastIndexOf('/');
            return path.indexOf('.', slash < 0 ? 0 : slash) >= 0;
        }

        private boolean pageExists(String page) {
            try {
                bridge.getContext().getAssets().open("public" + page).close();
                return true;
            } catch (java.io.IOException e) {
                return false;
            }
        }
    }

    /** The original request with its URL replaced; everything else delegates. */
    static final class RewrittenRequest implements WebResourceRequest {

        private final WebResourceRequest original;
        private final Uri url;

        RewrittenRequest(WebResourceRequest original, Uri url) {
            this.original = original;
            this.url = url;
        }

        @Override
        public Uri getUrl() {
            return url;
        }

        @Override
        public boolean isForMainFrame() {
            return original.isForMainFrame();
        }

        @Override
        public boolean isRedirect() {
            return original.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return original.hasGesture();
        }

        @Override
        public String getMethod() {
            return original.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return original.getRequestHeaders();
        }
    }
}
