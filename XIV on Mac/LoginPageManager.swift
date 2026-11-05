//
//  LoginPageManager.swift
//  XIV on Mac
//
//  WebView 登入頁面管理器
//  負責 Swift 與 JavaScript 之間的橋接通訊
//

import Foundation
import WebKit
import Cocoa

/// 登入頁面訊息類型
enum LoginPageMessage: String {
    case requestAnnouncements // JS → Swift: 請求固定來源的公告列表
    case openAnnouncement     // JS → Swift: 在系統瀏覽器開啟官方公告
    case requestAccounts        // JS → Swift: 請求已儲存帳號列表
    case requestPassword        // JS → Swift: 請求指定帳號的密碼
    case checkOTPKey           // JS → Swift: 檢查帳號是否有已儲存的 OTP 金鑰
    case saveOTPKey            // JS → Swift: 儲存 OTP 金鑰
    case requestOTP            // JS → Swift: 請求生成 OTP
    case executeLogin          // JS → Swift: 執行登入
    case recaptchaError        // JS → Swift: reCAPTCHA 獲取失敗
    case updateAutoOtp         // JS → Swift: 更新自動 OTP 設定
}

/// 登入頁面管理器
class LoginPageManager: NSObject {
    static let loginPageURL = URL(string: "https://user.ffxiv.com.tw/")!
    // MARK: - Properties
    
    weak var webView: WKWebView?
    weak var delegate: LoginPageManagerDelegate?
    
    private var currentAccount: String?
    private var loginNavigation: WKNavigation?
    private var loginPageSession: String?
    private var bridgeEnabled = false
    private var announcementsTask: Task<Void, Never>?
    
    // MARK: - Initialization
    
    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        setupMessageHandlers()
    }
    
    deinit {
        removeMessageHandlers()
    }

    func loadLoginPage(_ html: String) {
        didFailNavigation()
        guard html.contains("<head>") else {
            Log.error("[LoginPageManager] 本機登入頁缺少 head，停止載入")
            return
        }
        let session = UUID().uuidString
        loginPageSession = session
        // 文件識別只注入本機 HTML，避免延遲回傳落入導航後的其他頁面。
        let page = html.replacingOccurrences(of: "<head>", with:
            "<head><script>Object.defineProperty(window, '__xivLoginSession', { value: '\(session)' });</script>")
        loginNavigation = webView?.loadHTMLString(page, baseURL: Self.loginPageURL)
    }

    func invalidateBridge() {
        bridgeEnabled = false
        currentAccount = nil
        announcementsTask?.cancel()
        announcementsTask = nil
    }

    func didCommit(_ navigation: WKNavigation?) {
        bridgeEnabled = navigation != nil && navigation === loginNavigation
            && webView?.url == Self.loginPageURL
        loginNavigation = nil
    }

    func didFailNavigation() {
        invalidateBridge()
        loginNavigation = nil
        loginPageSession = nil
    }
    
    // MARK: - Message Handler Setup
    
    private func setupMessageHandlers() {
        guard let webView = webView else { return }
        
        let contentController = webView.configuration.userContentController
        
        // 註冊所有訊息處理器
        for message in [
            LoginPageMessage.requestAccounts,
            .requestAnnouncements,
            .openAnnouncement,
            .requestPassword,
            .checkOTPKey,
            .saveOTPKey,
            .requestOTP,
            .executeLogin,
            .recaptchaError,
            .updateAutoOtp
        ] {
            contentController.add(self, name: message.rawValue)
        }
    }
    
    private func removeMessageHandlers() {
        guard let webView = webView else { return }
        
        let contentController = webView.configuration.userContentController
        
        for message in [
            LoginPageMessage.requestAccounts,
            .requestAnnouncements,
            .openAnnouncement,
            .requestPassword,
            .checkOTPKey,
            .saveOTPKey,
            .requestOTP,
            .executeLogin,
            .recaptchaError,
            .updateAutoOtp
        ] {
            contentController.removeScriptMessageHandler(forName: message.rawValue)
        }
    }
    
    // MARK: - Swift → JavaScript 通訊
    
    /// 發送已儲存的帳號列表到 JS
    func sendAccounts(_ accounts: [String]) {
        executeJavaScript("window.loginForm.receiveAccounts(accounts);", arguments: ["accounts": accounts])
    }
    
    /// 發送密碼到 JS
    func sendPassword(_ password: String) {
        executeJavaScript("window.loginForm.receivePassword(password);", arguments: ["password": password])
    }
    
    /// 通知 JS 該帳號有已儲存的 OTP 金鑰
    func notifyExistingOTPKey() {
        let script = "window.loginForm.onExistingOTPKey();"
        executeJavaScript(script)
    }
    
    /// 通知 JS 該帳號沒有已儲存的 OTP 金鑰
    func notifyNoOTPKey() {
        let script = "window.loginForm.onNoOTPKey();"
        executeJavaScript(script)
    }
    
    /// 發送生成的 OTP 和剩餘秒數到 JS
    func sendOTP(_ otp: String, remainingSeconds: Int) {
        executeJavaScript("window.loginForm.receiveOTP(otp, remainingSeconds);",
                          arguments: ["otp": otp, "remainingSeconds": remainingSeconds])
    }
    
    /// 重置登入按鈕狀態
    func resetLoginButton() {
        let script = "window.loginForm.resetLoginButton();"
        executeJavaScript(script)
    }
    
    /// 通知登入成功
    func notifyLoginSuccess() {
        let script = "window.loginForm.onLoginSuccess();"
        executeJavaScript(script)
    }
    
    // MARK: - Helper
    
    private func executeJavaScript(_ script: String, arguments: [String: Any] = [:]) {
        guard bridgeEnabled, webView?.url == Self.loginPageURL,
              let session = loginPageSession else { return }
        var parameters = arguments
        parameters["loginPageSession"] = session
        let guardedScript = "if (window.__xivLoginSession !== loginPageSession) return; \(script)"
        webView?.callAsyncJavaScript(guardedScript, arguments: parameters, in: nil, in: .page) { result in
            if case .failure(let error) = result {
                Log.error("[LoginPageManager] JavaScript error: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - WKScriptMessageHandler

extension LoginPageManager: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let frame = message.frameInfo
        let origin = frame.securityOrigin
        guard bridgeEnabled, let webView = webView,
              message.webView === webView, frame.webView === webView,
              userContentController === webView.configuration.userContentController,
              frame.isMainFrame, frame.request.url == Self.loginPageURL,
              webView.url == Self.loginPageURL,
              origin.protocol == "https", origin.host == "user.ffxiv.com.tw", origin.port == 0 else {
            return
        }
        guard let messageType = LoginPageMessage(rawValue: message.name) else {
            Log.warning("[LoginPageManager] Unknown message: \(message.name)")
            return
        }
        
        switch messageType {
        case .requestAnnouncements:
            guard message.body is NSNull else { return }
            handleRequestAnnouncements()

        case .openAnnouncement:
            if let value = message.body as? String, let url = URL(string: value),
               AnnouncementService.isAllowedLink(url) {
                NSWorkspace.shared.open(url)
            }

        case .requestAccounts:
            guard message.body is NSNull else { return }
            handleRequestAccounts()
            
        case .requestPassword:
            if let account = message.body as? String, !account.isEmpty {
                handleRequestPassword(account: account)
            }
            
        case .checkOTPKey:
            if let account = message.body as? String, !account.isEmpty {
                handleCheckOTPKey(account: account)
            }
            
        case .saveOTPKey:
            if let key = message.body as? String, !key.isEmpty {
                handleSaveOTPKey(key: key)
            }
            
        case .requestOTP:
            guard message.body is NSNull else { return }
            handleRequestOTP()
            
        case .executeLogin:
            if let credentials = message.body as? [String: String] {
                handleExecuteLogin(credentials: credentials)
            }
            
        case .recaptchaError:
            if let errorMessage = message.body as? String {
                handleRecaptchaError(message: errorMessage)
            }
            
        case .updateAutoOtp:
            if let enabled = message.body as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID() {
                handleUpdateAutoOtp(enabled: enabled.boolValue)
            }
        }
    }
    
    // MARK: - Message Handlers

    private func handleRequestAnnouncements() {
        guard announcementsTask == nil, let session = loginPageSession else { return }
        announcementsTask = Task { @MainActor [weak self] in
            guard let self = self else { return }
            defer {
                if self.loginPageSession == session { self.announcementsTask = nil }
            }
            do {
                let items = try await AnnouncementService.fetch()
                guard !Task.isCancelled, self.loginPageSession == session else { return }
                self.executeJavaScript("window.loginForm.receiveAnnouncements(items);", arguments: ["items": items])
            } catch {
                guard !Task.isCancelled, self.loginPageSession == session else { return }
                Log.warning("[LoginPageManager] 無法載入官方公告")
                self.executeJavaScript("window.loginForm.onAnnouncementsError();")
            }
        }
    }
    
    private func handleRequestAccounts() {
        delegate?.loginPageManagerRequestAccounts(self)
    }
    
    private func handleRequestPassword(account: String) {
        self.currentAccount = account
        delegate?.loginPageManager(self, requestPasswordForAccount: account)
    }
    
    private func handleCheckOTPKey(account: String) {
        self.currentAccount = account
        delegate?.loginPageManager(self, checkOTPKeyForAccount: account)
    }
    
    private func handleSaveOTPKey(key: String) {
        guard let account = currentAccount else {
            Log.error("[LoginPageManager] No current account when saving OTP key")
            return
        }
        delegate?.loginPageManager(self, saveOTPKey: key, forAccount: account)
    }
    
    private func handleRequestOTP() {
        guard let account = currentAccount else {
            Log.error("[LoginPageManager] No current account when requesting OTP")
            return
        }
        delegate?.loginPageManager(self, requestOTPForAccount: account)
    }
    
    private func handleExecuteLogin(credentials: [String: String]) {
        guard let username = credentials["username"],
              let password = credentials["password"],
              let recaptchaToken = credentials["recaptchaToken"],
              !username.isEmpty, !password.isEmpty, !recaptchaToken.isEmpty,
              Set(credentials.keys).isSubset(of: ["username", "password", "otp", "recaptchaToken"]) else {
            Log.error("[LoginPageManager] Invalid credentials format")
            return
        }
        
        let otp = credentials["otp"] ?? ""
        
        delegate?.loginPageManager(self,
                                  executeLoginWithUsername: username,
                                  password: password,
                                  otp: otp,
                                  recaptchaToken: recaptchaToken)
    }
    
    private func handleRecaptchaError(message: String) {
        delegate?.loginPageManager(self, recaptchaErrorOccurred: message)
    }
    
    private func handleUpdateAutoOtp(enabled: Bool) {
        Settings.usesOneTimePassword = enabled
    }
}

// MARK: - Delegate Protocol

protocol LoginPageManagerDelegate: AnyObject {
    /// 請求已儲存的帳號列表
    func loginPageManagerRequestAccounts(_ manager: LoginPageManager)
    
    /// 請求指定帳號的密碼
    func loginPageManager(_ manager: LoginPageManager, requestPasswordForAccount account: String)
    
    /// 檢查帳號是否有已儲存的 OTP 金鑰
    func loginPageManager(_ manager: LoginPageManager, checkOTPKeyForAccount account: String)
    
    /// 儲存 OTP 金鑰
    func loginPageManager(_ manager: LoginPageManager, saveOTPKey key: String, forAccount account: String)
    
    /// 請求生成 OTP
    func loginPageManager(_ manager: LoginPageManager, requestOTPForAccount account: String)
    
    /// 執行登入
    func loginPageManager(_ manager: LoginPageManager,
                         executeLoginWithUsername username: String,
                         password: String,
                         otp: String,
                         recaptchaToken: String)
    
    /// reCAPTCHA 錯誤發生
    func loginPageManager(_ manager: LoginPageManager, recaptchaErrorOccurred message: String)
}

// MARK: - 遊戲狀態管理擴展
extension LoginPageManager {
    /// 通知 JS 遊戲已啟動（暫停 OTP、disable 登入按鈕）
    func notifyGameStarted() {
        let script = "window.loginForm.onGameStarted();"
        executeJavaScript(script)
        Log.information("[LoginPageManager] Notified JS: game started")
    }
    
    /// 通知 JS 遊戲已結束（恢復 OTP、enable 登入按鈕）
    func notifyGameExited(exitCode: Int32) {
        executeJavaScript("window.loginForm.onGameExited(exitCode);", arguments: ["exitCode": exitCode])
        Log.information("[LoginPageManager] Notified JS: game exited with code \(exitCode)")
    }
    
    /// 發送自動 OTP 設定狀態到 JS
    func sendAutoOtpSetting(_ enabled: Bool) {
        executeJavaScript("window.loginForm.receiveAutoOtpSetting(enabled);", arguments: ["enabled": enabled])
    }
}
