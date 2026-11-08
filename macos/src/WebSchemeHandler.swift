import Foundation
import WebKit

/// Serves the bundled frontend out of Contents/Resources/web.
///
/// A custom scheme (rather than file://) is what gives the app a real, stable
/// origin: `opticalbench://app`. That matters because the editor's autosave and
/// window state are keyed by origin, and file:// origins are opaque in WebKit.
final class WebSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "opticalbench"

    private let root: URL

    init(root: URL) {
        self.root = root
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        // opticalbench://app/... -> <root>/...
        var rel = url.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        let normalized = rel.hasPrefix("/") ? String(rel.dropFirst()) : rel
        let file = root.appendingPathComponent(normalized).standardized

        // never serve outside the bundle
        guard file.path.hasPrefix(root.standardized.path) else {
            task.didFailWithError(NSError(domain: "opticalbench", code: 403,
                                          userInfo: [NSLocalizedDescriptionKey: "forbidden"]))
            return
        }
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "opticalbench", code: 404,
                                          userInfo: [NSLocalizedDescriptionKey: "missing \(normalized)"]))
            return
        }

        let response = URLResponse(url: url,
                                   mimeType: Self.mimeType(for: file.pathExtension),
                                   expectedContentLength: data.count,
                                   textEncodingName: "utf-8")
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // nothing to cancel: responses are delivered synchronously
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "woff2": return "font/woff2"
        case "ico": return "image/x-icon"
        default: return "application/octet-stream"
        }
    }
}
