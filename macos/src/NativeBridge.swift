import AppKit
import UniformTypeIdentifiers
import WebKit

/// JS <-> native bridge.
///
/// The frontend talks to it through `window.__ob.call(op, args)` (installed by
/// `bootstrapScript`), which returns a Promise. Replies travel back as base64
/// encoded JSON, so no string escaping is needed on either side.
final class NativeBridge: NSObject, WKScriptMessageHandler {
    /// Called when the page acknowledges a flush request (see AppDelegate).
    var onFlushAck: (() -> Void)?

    private weak var webView: WKWebView?
    private var lastDirectory: URL?

    private static let appSupport: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        let dir = base.appendingPathComponent("Optical Bench", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private var autosaveURL: URL { Self.appSupport.appendingPathComponent("autosave.json") }

    func attach(to webView: WKWebView) {
        self.webView = webView
        if let stored = UserDefaults.standard.string(forKey: "lastDirectory") {
            lastDirectory = URL(fileURLWithPath: stored)
        }
    }

    /// Injected before any page script runs.
    static let bootstrapScript = """
    (function () {
      if (window.__ob) return;
      var seq = 0;
      var pending = Object.create(null);
      window.__obResolve = function (id, b64) {
        var entry = pending[id];
        if (!entry) return;
        delete pending[id];
        try {
          var json = b64
            ? new TextDecoder().decode(Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }))
            : 'null';
          entry.resolve(JSON.parse(json));
        } catch (err) {
          entry.reject(err);
        }
      };
      window.__ob = {
        version: '1.3.0',
        call: function (op, args) {
          return new Promise(function (resolve, reject) {
            var id = ++seq;
            pending[id] = { resolve: resolve, reject: reject };
            window.webkit.messageHandlers.ob.postMessage({ id: id, op: op, args: args || {} });
          });
        }
      };
    })();
    """

    // MARK: - WKScriptMessageHandler

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else { return }

        if op == "flushDone" {
            onFlushAck?()
            return
        }

        let id = body["id"] as? Int ?? 0
        let args = body["args"] as? [String: Any] ?? [:]

        switch op {
        // Modal panels must not run inside the message handler: hop out to the
        // run loop first, then reply once the user dismissed them.
        case "saveFile":
            afterCurrentCallback { [weak self] in
                guard let self else { return }
                self.send(self.saveFile(args), id: id)
            }
        case "openFile":
            afterCurrentCallback { [weak self] in
                guard let self else { return }
                self.send(self.openFile(), id: id)
            }
        case "readAutosave":
            send(readAutosave(), id: id)
        case "writeAutosave":
            send(writeAutosave(args), id: id)
        case "copyImage":
            send(copyImage(args), id: id)
        default:
            send(["ok": false, "error": "unknown op \(op)"], id: id)
        }
    }

    private func afterCurrentCallback(_ block: @escaping () -> Void) {
        DispatchQueue.main.async {
            NSApp.activate(ignoringOtherApps: true)
            block()
        }
    }

    // MARK: - operations

    private func saveFile(_ args: [String: Any]) -> [String: Any] {
        let name = args["name"] as? String ?? "untitled"
        let kind = args["kind"] as? String ?? "text"

        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        switch kind {
        case "json": panel.allowedContentTypes = [.json]
        case "png": panel.allowedContentTypes = [.png]
        case "svg": panel.allowedContentTypes = [.svg]
        default: break
        }
        if let dir = lastDirectory { panel.directoryURL = dir }

        guard panel.runModal() == .OK, let url = panel.url else {
            return ["ok": false, "cancelled": true]
        }

        let payload: Data?
        if kind == "png" {
            payload = Data(base64Encoded: args["data"] as? String ?? "")
        } else {
            payload = (args["data"] as? String ?? "").data(using: .utf8)
        }
        guard let data = payload else { return ["ok": false, "error": "could not decode the file payload"] }

        do {
            try data.write(to: url, options: .atomic)
            remember(url)
            return ["ok": true, "path": url.path]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    private func openFile() -> [String: Any] {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.json]
        if let dir = lastDirectory { panel.directoryURL = dir }

        guard panel.runModal() == .OK, let url = panel.url else {
            return ["ok": false, "cancelled": true]
        }
        guard let text = try? String(contentsOf: url, encoding: .utf8) else {
            return ["ok": false, "error": "could not read the file as UTF-8 text"]
        }
        remember(url)
        return ["ok": true, "name": url.lastPathComponent, "text": text, "path": url.path]
    }

    private func readAutosave() -> [String: Any] {
        guard let text = try? String(contentsOf: autosaveURL, encoding: .utf8) else {
            return ["text": NSNull()]
        }
        return ["text": text]
    }

    private func writeAutosave(_ args: [String: Any]) -> [String: Any] {
        let text = args["text"] as? String ?? ""
        do {
            try text.data(using: .utf8)?.write(to: autosaveURL, options: .atomic)
            return ["ok": true]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    private func copyImage(_ args: [String: Any]) -> [String: Any] {
        guard let data = Data(base64Encoded: args["data"] as? String ?? "") else {
            return ["ok": false, "error": "could not decode the image"]
        }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        if pasteboard.setData(data, forType: .png) {
            return ["ok": true]
        }
        return ["ok": false, "error": "the clipboard refused the image"]
    }

    // MARK: - helpers

    private func remember(_ url: URL) {
        lastDirectory = url.deletingLastPathComponent()
        UserDefaults.standard.set(lastDirectory?.path, forKey: "lastDirectory")
    }

    private func send(_ payload: [String: Any], id: Int) {
        let JSON: Data
        do {
            JSON = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            JSON = Data("{\"ok\":false,\"error\":\"reply encoding failed\"}".utf8)
        }
        let b64 = JSON.base64EncodedString()
        let script = "window.__obResolve(\(id), '\(b64)');"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}
