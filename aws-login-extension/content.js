// AWS signin.aws.amazon.com 에서 자동 로그인 처리
(async () => {
  const data = await new Promise(resolve =>
    chrome.storage.local.get('pendingLogin', d => resolve(d.pendingLogin))
  );
  if (!data) return;

  // 사용 후 즉시 삭제 (보안)
  chrome.storage.local.remove('pendingLogin');

  await waitAndFill(data);
})();

async function waitAndFill(acct) {
  // Step 1: 사용자 이름 입력 화면
  // (ACCOUNT_ID.signin.aws.amazon.com/console/ URL을 쓰면 계정 입력 단계가 없음)
  await fillStep(() => {
    const userField = document.getElementById('username') ||
                      document.querySelector('input[name="username"]');
    if (!userField || userField.offsetParent === null) return false;
    setValue(userField, acct.username);
    clickNext();
    return true;
  });

  // Step 2: 비밀번호 입력 화면
  await fillStep(() => {
    const pwField = document.getElementById('password') ||
                    document.querySelector('input[type="password"]');
    if (!pwField || pwField.offsetParent === null) return false;
    setValue(pwField, acct.password);
    clickSubmit();
    return true;
  });

  // Step 3: MFA 코드 입력 화면 (설정된 경우에만)
  if (acct.mfaSecret) {
    await fillStep(async () => {
      const mfaField = document.getElementById('mfaCode') ||
                       document.querySelector('input[name="mfaCode"]') ||
                       document.querySelector('input[autocomplete="one-time-code"]') ||
                       document.querySelector('input[placeholder*="MFA"]') ||
                       document.querySelector('input[placeholder*="mfa"]');
      if (!mfaField || mfaField.offsetParent === null) return false;
      const code = await window.TOTP.generateTOTP(acct.mfaSecret);
      setValue(mfaField, code);
      clickSubmit();
      return true;
    }, 12000);
  }
}

function setValue(el, value) {
  // React synthetic events 호환
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickNext() {
  const btn = document.getElementById('next_button') ||
              document.querySelector('button[type="submit"]') ||
              document.querySelector('.awsui-button-variant-primary');
  btn?.click();
}

function clickSubmit() {
  const btn = document.getElementById('signin_button') ||
              document.querySelector('button[type="submit"]') ||
              document.querySelector('input[type="submit"]');
  btn?.click();
}

function fillStep(fn, maxWait = 8000, interval = 200) {
  return new Promise(resolve => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (fn()) {
        clearInterval(timer);
        setTimeout(resolve, 800); // 다음 화면 전환 대기
      } else if (Date.now() - start > maxWait) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}
