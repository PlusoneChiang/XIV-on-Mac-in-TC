/**
 * XIV on Mac - 登入頁面邏輯
 * Phase 1: 基礎框架實現
 */

// reCAPTCHA Site Key
const SITE_KEY = "6Ld6VmorAAAAANQdQeqkaOeScR42qHC7Hyalq00r";

/**
 * 登入表單管理類
 */
class LoginForm {
  constructor() {
    // DOM 元素
    this.username = document.getElementById('username');
    this.password = document.getElementById('password');
    this.otp = document.getElementById('otp');
    this.otpGroup = document.getElementById('otpGroup');
    this.autoOTP = document.getElementById('autoOTP');
    this.otpKeyGroup = document.getElementById('otpKeyGroup');
    this.otpKey = document.getElementById('otpKey');
    this.confirmOtpKeyBtn = document.getElementById('confirmOtpKey');
    this.loginButton = document.getElementById('loginButton');
    this.accountDropdownBtn = document.getElementById('accountDropdownBtn');
    this.accountDropdown = document.getElementById('accountDropdown');
    this.announcements = document.getElementById('announcements');

    // OTP 倒數計時器
    this.otpCountdownTimer = null;

    // 初始化
    this.init();
  }

  /**
   * 初始化事件監聽器
   */
  init() {
    console.log('[LoginPage] Initializing...');

    // 帳號下拉按鈕
    this.accountDropdownBtn.addEventListener('click', this.toggleAccountDropdown.bind(this));

    // 點擊外部關閉下拉選單
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.account-selector')) {
        this.accountDropdown.style.display = 'none';
      }
    });

    // 帳號選擇變化
    this.username.addEventListener('change', this.onAccountChange.bind(this));
    this.username.addEventListener('input', this.onAccountInput.bind(this));

    // 即時表單驗證：監聽所有輸入框變化
    this.username.addEventListener('input', this.checkFormValidity.bind(this));
    this.password.addEventListener('input', this.checkFormValidity.bind(this));
    this.otp.addEventListener('input', this.checkFormValidity.bind(this));

    // 初始檢查表單狀態
    this.checkFormValidity();

    // 自動 OTP 核選框
    this.autoOTP.addEventListener('change', this.onAutoOTPToggle.bind(this));

    // OTP 金鑰確認按鈕
    this.confirmOtpKeyBtn.addEventListener('click', this.onConfirmOTPKey.bind(this));

    // 登入按鈕
    this.loginButton.addEventListener('click', this.onLogin.bind(this));

    // Enter 鍵快捷登入
    this.password.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.onLogin();
      }
    });

    // 請求已儲存的帳號列表
    this.requestAccounts();
    this.requestAnnouncements();

    console.log('[LoginPage] Initialized successfully');
  }

  // ===== 帳號管理 =====

  /**
   * 請求已儲存的帳號列表
   */
  requestAccounts() {
    console.log('[LoginPage] Requesting saved accounts...');
    if (window.webkit && window.webkit.messageHandlers.requestAccounts) {
      window.webkit.messageHandlers.requestAccounts.postMessage(null);
    }
  }

  requestAnnouncements() {
    if (window.webkit && window.webkit.messageHandlers.requestAnnouncements) {
      if (this.announcements) {
        const status = document.createElement('p');
        status.className = 'announcements-status';
        status.textContent = '載入官方公告中…';
        this.announcements.replaceChildren(status);
      }
      window.webkit.messageHandlers.requestAnnouncements.postMessage(null);
    }
  }

  receiveAnnouncements(news) {
    if (!this.announcements || !news || !Array.isArray(news.items)) {
      return this.onAnnouncementsError();
    }

    const items = news.items.filter(item => item
      && typeof item.title === 'string'
      && typeof item.url === 'string'
      && this.isAnnouncementURL(item.url));
    if (items.length === 0) {
      return this.onAnnouncementsError();
    }

    const fragment = document.createDocumentFragment();
    const banners = (Array.isArray(news.banners) ? news.banners : []).filter(banner => banner
      && typeof banner.imageUrl === 'string'
      && typeof banner.url === 'string'
      && this.isAnnouncementURL(banner.imageUrl)
      && this.isAnnouncementURL(banner.url));
    if (banners.length) {
      fragment.appendChild(this.createAnnouncementBanner(banners));
    }

    const categories = ['最新', '活動', '更新', '維護', '其他'];
    const groups = new Map(categories.map(category => [category, category === '最新'
      ? items.slice(0, 10)
      : items.filter(item => item.category === category)]));
    const tabs = document.createElement('div');
    tabs.className = 'announcement-tabs';
    const list = document.createElement('div');
    list.className = 'announcement-list';
    const renderItems = category => {
      list.replaceChildren();
      for (const item of groups.get(category)) {
        list.appendChild(this.createAnnouncementItem(item));
      }
      if (list.childElementCount === 0) {
        const empty = document.createElement('p');
        empty.className = 'announcements-status';
        empty.textContent = '目前沒有可顯示的公告。';
        list.appendChild(empty);
      }
      tabs.querySelectorAll('button').forEach(tab => {
        const selected = tab.dataset.category === category;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-pressed', String(selected));
      });
    };
    for (const category of categories) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = category;
      tab.dataset.category = category;
      tab.setAttribute('aria-pressed', 'false');
      tab.addEventListener('click', () => renderItems(category));
      tabs.appendChild(tab);
    }
    renderItems('最新');
    fragment.append(tabs, list);

    if (typeof news.moreUrl === 'string' && this.isAnnouncementURL(news.moreUrl)) {
      const footer = document.createElement('div');
      footer.className = 'announcement-footer';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'announcement-more';
      more.textContent = '更多公告 ›';
      more.addEventListener('click', () => this.openAnnouncement(news.moreUrl));
      footer.appendChild(more);
      fragment.appendChild(footer);
    }
    this.announcements.replaceChildren(fragment);
  }

  createAnnouncementBanner(banners) {
    let index = 0;
    let image;
    let dots;
    let transitioning = false;
    const banner = document.createElement('div');
    banner.className = 'announcement-banner';
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'announcement-banner-link';
    link.setAttribute('aria-label', '查看活動公告');
    link.addEventListener('click', () => this.openAnnouncement(banners[index].url));
    const showBanner = async nextIndex => {
      const targetIndex = (nextIndex + banners.length) % banners.length;
      if (transitioning || (image?.hasAttribute('src') && targetIndex === index)) return;
      transitioning = true;
      const incoming = document.createElement('img');
      incoming.alt = '';
      incoming.src = banners[targetIndex].imageUrl;
      try {
        await incoming.decode();
      } catch {
        transitioning = false;
        return;
      }
      const outgoing = image;
      const direction = nextIndex < index ? -1 : 1;
      index = targetIndex;
      link.appendChild(incoming);
      image = incoming;
      dots?.querySelectorAll('button').forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === index);
        dot.setAttribute('aria-pressed', String(dotIndex === index));
      });
      if (outgoing && typeof incoming.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const options = { duration: 400, easing: 'ease-in-out', fill: 'forwards' };
        const animations = [
          outgoing.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(' + (-24 * direction) + 'px)' }], options),
          incoming.animate([{ opacity: 0, transform: 'translateX(' + (24 * direction) + 'px)' }, { opacity: 1, transform: 'translateX(0)' }], options)
        ];
        await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
        animations.forEach(animation => animation.cancel());
      }
      outgoing?.remove();
      transitioning = false;
    };
    banner.appendChild(link);
    if (banners.length > 1) {
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'announcement-previous';
      previous.textContent = '‹';
      previous.setAttribute('aria-label', '上一則橫幅');
      previous.addEventListener('click', () => showBanner(index - 1));
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'announcement-next';
      next.textContent = '›';
      next.setAttribute('aria-label', '下一則橫幅');
      next.addEventListener('click', () => showBanner(index + 1));
      dots = document.createElement('div');
      dots.className = 'announcement-dots';
      banners.forEach((_, dotIndex) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = dotIndex === 0 ? 'active' : '';
        dot.setAttribute('aria-label', '第 ' + (dotIndex + 1) + ' 則橫幅');
        dot.setAttribute('aria-pressed', String(dotIndex === 0));
        dot.addEventListener('click', () => showBanner(dotIndex));
        dots.appendChild(dot);
      });
      banner.append(previous, next, dots);
    }
    showBanner(0);
    if (banners.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = setInterval(() => {
        if (!banner.isConnected) clearInterval(timer);
        else if (!document.hidden && !banner.matches(':hover, :focus-within')) showBanner(index + 1);
      }, 5000);
    }
    return banner;
  }

  createAnnouncementItem(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'announcement-item';
    button.addEventListener('click', () => this.openAnnouncement(item.url));
    const date = document.createElement('span');
    date.className = 'announcement-date';
    date.textContent = typeof item.date === 'string' ? item.date : '';
    const category = document.createElement('span');
    category.className = 'announcement-category';
    category.textContent = typeof item.category === 'string' ? item.category : '';
    const title = document.createElement('span');
    title.className = 'announcement-title';
    title.title = item.title;
    if (item.isPinned === true || item.isPinned === 'true') {
      const pinned = document.createElement('span');
      pinned.className = 'announcement-pinned';
      pinned.textContent = '置頂';
      title.appendChild(pinned);
    }
    const text = document.createElement('span');
    text.className = 'announcement-title-text';
    text.textContent = item.title;
    title.appendChild(text);
    button.append(date, category, title);
    return button;
  }

  openAnnouncement(url) {
    if (this.isAnnouncementURL(url)) {
      window.webkit?.messageHandlers.openAnnouncement?.postMessage(url);
    }
  }

  onAnnouncementsError() {
    if (!this.announcements) return;
    const status = document.createElement('p');
    status.className = 'announcements-status';
    status.textContent = '目前無法載入官方公告。';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'announcements-retry';
    retry.textContent = '重新整理';
    retry.addEventListener('click', () => this.requestAnnouncements());
    this.announcements.replaceChildren(status, retry);
  }

  isAnnouncementURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:'
        && url.port === ''
        && url.username === ''
        && url.password === ''
        && (url.hostname === 'ffxiv.com.tw' || url.hostname.endsWith('.ffxiv.com.tw'));
    } catch {
      return false;
    }
  }

  /**
   * 接收已儲存的帳號列表（由 Swift 調用）
   */
  receiveAccounts(accounts) {
    console.log('[LoginPage] Received', accounts.length, 'saved account(s)');
    // Note: Account names are not logged for security reasons

    const dropdown = this.accountDropdown;
    dropdown.innerHTML = '';

    if (accounts.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'account-dropdown-empty';
      emptyItem.textContent = 'No saved accounts';
      dropdown.appendChild(emptyItem);
    } else {
      // 填充下拉選單
      accounts.forEach(account => {
        const item = document.createElement('div');
        item.className = 'account-dropdown-item';
        item.textContent = account;
        item.addEventListener('click', () => {
          this.username.value = account;
          this.accountDropdown.style.display = 'none';
          // 切換帳號時請求密碼
          this.requestPasswordForAccount(account);
        });
        dropdown.appendChild(item);
      });

      // 自動填入第一個帳號（最後使用的帳號）
      if (accounts.length > 0) {
        this.username.value = accounts[0];
        console.log('[LoginPage] Auto-filled first saved account');
        // 密碼會由 Swift 端在 loginPageManagerRequestAccounts 中自動發送
      }
    }
  }

  /**
   * 切換帳號下拉選單顯示
   */
  toggleAccountDropdown(event) {
    event.stopPropagation();
    const isVisible = this.accountDropdown.style.display === 'block';
    this.accountDropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      // 重新請求帳號列表
      this.requestAccounts();
    }
  }

  /**
   * 帳號選擇變化事件
   */
  onAccountChange(event) {
    const selectedAccount = event.target.value;
    console.log('[LoginPage] Account changed');
    // Note: Account name is not logged for security reasons

    if (selectedAccount) {
      this.requestPasswordForAccount(selectedAccount);
    }
  }

  /**
   * 帳號輸入變化（用於自動完成）
   */
  onAccountInput(event) {
    // 可以添加自動完成邏輯
  }

  /**
   * 請求指定帳號的密碼
   */
  requestPasswordForAccount(account) {
    console.log('[LoginPage] Requesting password for selected account');
    // Note: Account name is not logged for security reasons
    if (window.webkit && window.webkit.messageHandlers.requestPassword) {
      window.webkit.messageHandlers.requestPassword.postMessage(account);
    }
  }

  /**
   * 接收密碼（由 Swift 調用）
   */
  receivePassword(password) {
    console.log('[LoginPage] Password received');
    this.password.value = password;

    // 檢查表單有效性，更新登入按鈕狀態
    this.checkFormValidity();

    // 如果 OTP checkbox 已勾選，重新檢查新帳號的 OTP 金鑰
    if (this.autoOTP.checked) {
      const currentAccount = this.username.value;
      if (currentAccount) {
        console.log('[LoginPage] Re-checking OTP for new account');
        // 先停止舊的倒數計時
        this.stopOTPCountdown();
        // 清空 OTP
        this.otp.value = '';
        // 檢查新帳號的 OTP 金鑰
        this.checkOTPKey(currentAccount);
      }
    }
  }

  // ===== OTP 管理 =====

  /**
   * 自動 OTP 核選框變化事件
   */
  onAutoOTPToggle(event) {
    const checked = event.target.checked;
    console.log('[LoginPage] Auto OTP toggled:', checked);

    if (checked) {
      // checked 時不立即更新設定，先檢查是否已有儲存的金鑰
      const currentAccount = this.username.value;
      if (currentAccount) {
        this.checkOTPKey(currentAccount);
      } else {
        // 沒有選擇帳號，直接展開金鑰輸入框（不更新設定）
        this.showOTPKeyGroup();
      }
    } else {
      // 取消勾選：更新設定為 false，停止倒數計時、隱藏金鑰輸入框、清空內容
      if (window.webkit && window.webkit.messageHandlers.updateAutoOtp) {
        window.webkit.messageHandlers.updateAutoOtp.postMessage(false);
      }
      this.stopOTPCountdown();
      this.hideOTPKeyGroup();
      this.otpKey.value = '';
      this.otp.value = '';

      // 檢查表單有效性，更新登入按鈕狀態（OTP 被清空）
      this.checkFormValidity();
    }
  }

  /**
   * 檢查帳號是否有已儲存的 OTP 金鑰
   */
  checkOTPKey(account) {
    console.log('[LoginPage] Checking OTP key for selected account');
    // Note: Account name is not logged for security reasons
    if (window.webkit && window.webkit.messageHandlers.checkOTPKey) {
      window.webkit.messageHandlers.checkOTPKey.postMessage(account);
    }
  }

  /**
   * 有已儲存的金鑰（由 Swift 調用）
   */
  onExistingOTPKey() {
    console.log('[LoginPage] Existing OTP key found');
    // 有金鑰時更新設定為 true
    if (window.webkit && window.webkit.messageHandlers.updateAutoOtp) {
      window.webkit.messageHandlers.updateAutoOtp.postMessage(true);
    }
    // 隱藏金鑰輸入框
    this.hideOTPKeyGroup();
    // 不需要手動請求 OTP，Swift 會在 checkOTPKey 時自動發送
  }

  /**
   * 沒有已儲存的金鑰（由 Swift 調用）
   */
  onNoOTPKey() {
    console.log('[LoginPage] No OTP key found');

    // 只要 checkbox 是勾選狀態，就展開金鑰輸入框讓使用者輸入
    if (this.autoOTP.checked) {
      this.showOTPKeyGroup();
      console.log('[LoginPage] Showing OTP key input (no key found)');
    }
  }

  /**
   * 展開金鑰輸入框（帶平滑動畫）
   */
  showOTPKeyGroup() {
    // 先設置為 block 但高度為 0
    this.otpKeyGroup.style.display = 'block';
    this.otpKeyGroup.style.maxHeight = '0';
    this.otpKeyGroup.style.opacity = '0';
    this.otpKeyGroup.style.overflow = 'hidden';
    this.otpKeyGroup.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease';

    // 強制重排以確保動畫生效
    this.otpKeyGroup.offsetHeight;

    // 展開到自然高度
    this.otpKeyGroup.style.maxHeight = '200px';
    this.otpKeyGroup.style.opacity = '1';

    // 聚焦到金鑰輸入框
    setTimeout(() => {
      this.otpKey.focus();
    }, 300);
  }

  /**
   * 收起金鑰輸入框（帶平滑動畫）
   */
  hideOTPKeyGroup() {
    this.otpKeyGroup.style.maxHeight = '0';
    this.otpKeyGroup.style.opacity = '0';

    // 動畫結束後隱藏元素
    setTimeout(() => {
      this.otpKeyGroup.style.display = 'none';
    }, 300);
  }

  /**
   * 確認 OTP 金鑰按鈕點擊事件
   */
  onConfirmOTPKey() {
    const key = this.otpKey.value.trim();
    console.log('[LoginPage] Confirming OTP key');

    if (!key) {
      alert('請輸入 OTP 金鑰');
      return;
    }

    // 發送金鑰到 Swift 進行驗證和儲存
    this.saveOTPKey(key);
  }

  /**
   * 儲存 OTP 金鑰
   */
  saveOTPKey(key) {
    console.log('[LoginPage] Saving OTP key');
    if (window.webkit && window.webkit.messageHandlers.saveOTPKey) {
      window.webkit.messageHandlers.saveOTPKey.postMessage(key);
    }
    // 儲存金鑰後，更新 auto OTP 設定為 true
    if (window.webkit && window.webkit.messageHandlers.updateAutoOtp) {
      window.webkit.messageHandlers.updateAutoOtp.postMessage(true);
    }
  }

  /**
   * 請求生成 OTP
   */
  requestOTP() {
    console.log('[LoginPage] Requesting OTP generation');
    if (window.webkit && window.webkit.messageHandlers.requestOTP) {
      window.webkit.messageHandlers.requestOTP.postMessage(null);
    }
  }

  /**
   * 接收生成的 OTP 和剩餘秒數（由 Swift 調用）
   */
  receiveOTP(otp, remainingSeconds) {
    console.log('[LoginPage] OTP received, remaining:', remainingSeconds, 's');
    // Note: OTP value is not logged for security reasons

    // 只有在自動 OTP 模式下才填入（避免覆蓋手動輸入）
    if (this.autoOTP.checked) {
      this.otp.value = otp;

      // 檢查表單有效性，更新登入按鈕狀態
      this.checkFormValidity();

      // 視覺提示（只在自動填入時顯示）
      this.otp.classList.add('otp-updated');
      setTimeout(() => {
        this.otp.classList.remove('otp-updated');
      }, 500);
    }

    // 隱藏金鑰輸入框
    this.hideOTPKeyGroup();

    // 使用實際的剩餘秒數開始倒數
    this.startOTPCountdown(remainingSeconds);
  }

  // ===== 登入流程 =====

  /**
   * 登入按鈕點擊事件
   */
  async onLogin() {
    console.log('[LoginPage] Login button clicked');

    // 禁用按鈕，顯示載入狀態
    this.loginButton.disabled = true;
    this.loginButton.classList.add('loading');
    this.loginButton.textContent = 'Login...';

    try {
      // 1. 驗證表單
      if (!this.validateForm()) {
        this.resetLoginButton();
        return;
      }

      // 2. 獲取 reCAPTCHA token
      const token = await this.getRecaptchaToken();
      console.log('[LoginPage] reCAPTCHA token obtained');

      // 3. 收集表單數據
      const credentials = {
        username: this.username.value,
        password: this.password.value,
        otp: this.otp.value || '',
        recaptchaToken: token
      };

      // 4. 通知 Swift 執行登入
      this.executeLogin(credentials);

    } catch (error) {
      console.error('[LoginPage] Login error:', error);
      // reCAPTCHA 獲取失敗，通知 Swift
      this.notifyRecaptchaError(error.message);
      this.resetLoginButton();
    }
  }

  /**
   * 表單驗證
   */
  validateForm() {
    if (!this.username.value.trim()) {
      console.warn('[LoginPage] Username is empty');
      alert('Please enter your login account');
      return false;
    }

    if (!this.password.value) {
      console.warn('[LoginPage] Password is empty');
      alert('Please enter your password');
      return false;
    }

    if (!this.otp.value.trim()) {
      console.warn('[LoginPage] OTP is empty');
      alert('Please enter 6-digit OTP');
      return false;
    }

    // 驗證 OTP 格式（6 位數字）
    if (!/^\d{6}$/.test(this.otp.value)) {
      console.warn('[LoginPage] OTP format invalid');
      alert('OTP must be 6 digits');
      return false;
    }

    return true;
  }

  /**
   * 即時檢查表單有效性，控制登入按鈕啟用/禁用
   */
  checkFormValidity() {
    const isValid =
      this.username.value.trim() !== '' &&
      this.password.value !== '' &&
      this.otp.value.trim() !== '';

    this.loginButton.disabled = !isValid;

    // 更新按鈕樣式
    if (isValid) {
      this.loginButton.classList.remove('disabled');
    } else {
      this.loginButton.classList.add('disabled');
    }
  }

  /**
   * 獲取 reCAPTCHA token
   * 增加延遲讓 reCAPTCHA 有更多時間收集行為數據
   */
  async getRecaptchaToken() {
    console.log('[LoginPage] Getting reCAPTCHA token...');
    await new Promise(resolve => setTimeout(resolve, 800));

    return new Promise((resolve, reject) => {
      if (typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) {
        reject(new Error('reCAPTCHA SDK not loaded'));
        return;
      }

      grecaptcha.enterprise.ready(() => {
        grecaptcha.enterprise.execute(SITE_KEY, { action: 'LOGIN' })
          .then(token => {
            console.log('[LoginPage] reCAPTCHA token obtained successfully');
            resolve(token);
          })
          .catch(error => {
            console.error('[LoginPage] reCAPTCHA execution failed:', error);
            reject(error);
          });
      });
    });
  }

  /**
   * 執行登入（通知 Swift）
   */
  executeLogin(credentials) {
    console.log('[LoginPage] Executing login...');
    // Note: Username, password and OTP are not logged for security reasons
    if (window.webkit && window.webkit.messageHandlers.executeLogin) {
      window.webkit.messageHandlers.executeLogin.postMessage(credentials);
    } else {
      console.error('[LoginPage] executeLogin handler not available');
      this.resetLoginButton();
    }
  }

  /**
   * 通知 reCAPTCHA 錯誤
   */
  notifyRecaptchaError(message) {
    console.error('[LoginPage] Notifying reCAPTCHA error:', message);
    if (window.webkit && window.webkit.messageHandlers.recaptchaError) {
      window.webkit.messageHandlers.recaptchaError.postMessage(message);
    }
  }

  // ===== 狀態管理 =====

  /**
   * 重置登入按鈕狀態
   */
  resetLoginButton() {
    console.log('[LoginPage] Resetting login button');
    this.loginButton.disabled = false;
    this.loginButton.classList.remove('loading');
    this.loginButton.textContent = 'Login';
  }

  /**
   * 登入成功回調（由 Swift 調用）
   */
  onLoginSuccess() {
    console.log('[LoginPage] Login successful');
    // 可選：顯示過渡動畫
    document.querySelector('.login-form').style.opacity = '0.5';
  }

  // ===== OTP 倒數計時管理 =====

  /**
   * 開始 OTP 倒數計時
   */
  startOTPCountdown(initialRemaining) {
    // 清除舊的計時器
    if (this.otpCountdownTimer) {
      clearInterval(this.otpCountdownTimer);
    }

    let remaining = initialRemaining;

    // 立即更新一次
    this.updateOTPProgress(remaining);

    // 每秒更新
    this.otpCountdownTimer = setInterval(() => {
      remaining--;

      if (remaining <= 0) {
        // 倒數到 0，主動請求新的 OTP
        console.log('[LoginPage] OTP expired, requesting new one...');
        this.requestOTP();
        // 暫時顯示 30 秒，等待 Swift 回應
        remaining = 30;
      }

      this.updateOTPProgress(remaining);
    }, 1000);
  }

  /**
   * 更新 OTP 進度條和剩餘時間顯示
   */
  updateOTPProgress(remaining) {
    const circle = document.getElementById('otpTimerCircle');
    const progressPath = document.getElementById('otpCircleProgress');
    const text = document.getElementById('otpRemainingTime');

    if (!circle || !progressPath || !text) return;

    // 顯示環形進度
    circle.classList.add('active');

    // 更新文字
    text.textContent = remaining;

    // 計算進度百分比 (0-100)
    const percentage = (remaining / 30) * 100;
    progressPath.setAttribute('stroke-dasharray', `${percentage}, 100`);

    // 剩餘 5 秒時變紅色
    if (remaining <= 5) {
      progressPath.classList.add('expiring');
    } else {
      progressPath.classList.remove('expiring');
    }
  }

  /**
   * 停止 OTP 倒數計時
   */
  stopOTPCountdown() {
    if (this.otpCountdownTimer) {
      clearInterval(this.otpCountdownTimer);
      this.otpCountdownTimer = null;
      console.log('[LoginPage] OTP countdown stopped');
    }

    // 隱藏環形進度
    const circle = document.getElementById('otpTimerCircle');
    if (circle) {
      circle.classList.remove('active');
    }
  }

  // ===== 遊戲狀態管理 =====

  /**
   * 接收自動 OTP 設定（由 Swift 調用）
   */
  receiveAutoOtpSetting(enabled) {
    console.log('[LoginPage] Received auto OTP setting:', enabled);
    this.autoOTP.checked = enabled;

    // 如果啟用且有帳號，觸發檢查
    if (enabled && this.username.value) {
      this.checkOTPKey(this.username.value);
    }
  }

  /**
   * 遊戲已啟動（由 Swift 調用）
   */
  onGameStarted() {
    console.log('[LoginPage] Game started - pausing OTP, disabling login');

    // 暫停 OTP 倒數計時
    this.stopOTPCountdown();

    // Disable 登入按鈕並更新文字
    this.loginButton.disabled = true;
    this.loginButton.classList.remove('loading'); // 移除旋轉圖示
    this.loginButton.textContent = 'Game Running...';
    this.loginButton.classList.add('button-disabled');
  }

  /**
   * 遊戲已結束（由 Swift 調用）
   */
  onGameExited(exitCode) {
    console.log('[LoginPage] Game exited with code:', exitCode);

    // 恢復登入按鈕（確保移除所有狀態類）
    this.loginButton.disabled = false;
    this.loginButton.classList.remove('loading'); // 確保移除旋轉圖示
    this.loginButton.classList.remove('button-disabled');
    this.loginButton.textContent = 'Login';

    // 如果自動 OTP 已啟用且有帳號，重新啟動計時
    if (this.autoOTP.checked && this.username.value) {
      console.log('[LoginPage] Restarting OTP countdown after game exit');
      // 請求新的 OTP
      if (window.webkit && window.webkit.messageHandlers.requestOTP) {
        window.webkit.messageHandlers.requestOTP.postMessage(null);
      }
    }
  }
}

// ===== 初始化 =====

// 等待 DOM 載入完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoginPage);
} else {
  initLoginPage();
}

function initLoginPage() {
  console.log('[LoginPage] DOM ready, initializing...');
  window.loginForm = new LoginForm();
}

// ===== 全域錯誤處理 =====

window.addEventListener('error', (event) => {
  console.error('[LoginPage] Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[LoginPage] Unhandled promise rejection:', event.reason);
});
