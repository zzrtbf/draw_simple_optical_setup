import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let bridge = NativeBridge()
    private var isFlushing = false

    // MARK: - lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let resources = Bundle.main.resourceURL ?? Bundle.main.bundleURL
        let webRoot = resources.appendingPathComponent("web", isDirectory: true)

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(WebSchemeHandler(root: webRoot), forURLScheme: WebSchemeHandler.scheme)

        let controller = WKUserContentController()
        controller.add(bridge, name: "ob")
        controller.addUserScript(WKUserScript(source: NativeBridge.bootstrapScript,
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        configuration.userContentController = controller
        if ProcessInfo.processInfo.environment["OB_DEBUG"] == "1" {
            configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        }

        let frame = NSRect(x: 0, y: 0, width: 1600, height: 980)
        webView = WKWebView(frame: frame, configuration: configuration)
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        webView.autoresizingMask = [.width, .height]

        window = NSWindow(contentRect: frame,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered,
                          defer: false)
        window.title = "Optical Bench"
        window.minSize = NSSize(width: 1100, height: 700)
        window.backgroundColor = NSColor(calibratedRed: 0.031, green: 0.043, blue: 0.063, alpha: 1)
        window.contentView = webView
        window.setFrameAutosaveName("OpticalBenchMainWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        bridge.attach(to: webView)
        bridge.onFlushAck = { [weak self] in self?.finishTermination() }

        guard let url = URL(string: "\(WebSchemeHandler.scheme)://app/index.html") else { return }
        webView.load(URLRequest(url: url))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

    /// Quitting must not lose the last edit: the page writes its autosave through
    /// the bridge, so ask it to flush synchronously before we go.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !isFlushing else { return .terminateNow }
        isFlushing = true
        webView.evaluateJavaScript("window.__obFlush && window.__obFlush()", completionHandler: nil)
        // the page is expected to answer with a flushDone message; do not hang forever
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.finishTermination()
        }
        return .terminateLater
    }

    private func finishTermination() {
        guard isFlushing else { return }
        isFlushing = false
        NSApp.reply(toApplicationShouldTerminate: true)
    }

    // MARK: - menu

    private func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Optical Bench",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
                        keyEquivalent: "")
        appMenu.addItem(.separator())
        let servicesItem = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        let servicesMenu = NSMenu()
        servicesItem.submenu = servicesMenu
        appMenu.addItem(servicesItem)
        NSApp.servicesMenu = servicesMenu
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Optical Bench",
                        action: #selector(NSApplication.hide(_:)),
                        keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others",
                                    action: #selector(NSApplication.hideOtherApplications(_:)),
                                    keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All",
                        action: #selector(NSApplication.unhideAllApplications(_:)),
                        keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Optical Bench",
                        action: #selector(NSApplication.terminate(_:)),
                        keyEquivalent: "q")

        let fileItem = NSMenuItem()
        mainMenu.addItem(fileItem)
        let fileMenu = NSMenu(title: "File")
        fileItem.submenu = fileMenu
        fileMenu.addItem(withTitle: "Close Window",
                         action: #selector(NSWindow.performClose(_:)),
                         keyEquivalent: "w")

        // Every Edit item is routed: text fields get the native behaviour, the
        // canvas gets the editor's own clipboard/undo. Adding a plain native
        // menu would swallow ⌘Z/⌘C/⌘V before the page ever sees them.
        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editItem.submenu = editMenu
        editMenu.addItem(withTitle: "Undo", action: #selector(menuUndo(_:)), keyEquivalent: "z")
        let redo = NSMenuItem(title: "Redo", action: #selector(menuRedo(_:)), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redo)
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(menuCut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(menuCopy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(menuPaste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(menuSelectAll(_:)), keyEquivalent: "a")

        let windowItem = NSMenuItem()
        mainMenu.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window")
        windowItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize",
                           action: #selector(NSWindow.performMiniaturize(_:)),
                           keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func menuUndo(_ sender: Any?) { route("undo", native: Selector(("undo:"))) }
    @objc private func menuRedo(_ sender: Any?) { route("redo", native: Selector(("redo:"))) }
    @objc private func menuCut(_ sender: Any?) { route("cut", native: #selector(NSText.cut(_:))) }
    @objc private func menuCopy(_ sender: Any?) { route("copy", native: #selector(NSText.copy(_:))) }
    @objc private func menuPaste(_ sender: Any?) { route("paste", native: #selector(NSText.paste(_:))) }
    @objc private func menuSelectAll(_ sender: Any?) { route("selectAll", native: #selector(NSText.selectAll(_:))) }

    /// If a text field has focus, hand the action to AppKit; otherwise let the
    /// editor handle it (canvas clipboard, undo history).
    private func route(_ operation: String, native selector: Selector) {
        webView.evaluateJavaScript("window.__obMenuActive ? window.__obMenuActive() : false") { [weak self] result, _ in
            guard let self else { return }
            if (result as? Bool) == true {
                NSApp.sendAction(selector, to: nil, from: nil)
            } else {
                self.webView.evaluateJavaScript("window.__obMenu && window.__obMenu('\(operation)')",
                                                completionHandler: nil)
            }
        }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
