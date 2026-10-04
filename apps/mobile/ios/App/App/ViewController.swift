import UIKit
import Capacitor

/// Serves the prerendered site from the bundle the way Netlify does.
///
/// Capacitor's default `CapacitorRouter` is written for single-page apps:
/// every extension-less path (`/person/moses_2108`, `/browse/`) is answered
/// with the ROOT `index.html`, so a multi-page site would show the home
/// page for every link. The web build is `format: 'directory'` — each page
/// is `<path>/index.html` — and this router maps to that file, falling back
/// to the site's own `404.html` when there is no such page.
struct StaticSiteRouter: Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        if !URL(fileURLWithPath: path).pathExtension.isEmpty {
            return basePath + path
        }
        var trimmed = path
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        let page = basePath + trimmed + "/index.html"
        if FileManager.default.fileExists(atPath: page) {
            return page
        }
        return basePath + "/404.html"
    }
}

class ViewController: CAPBridgeViewController {
    override func router() -> Router {
        return StaticSiteRouter()
    }
}
