const AVATAR_COLORS = [
  '#e11d48','#db2777','#9333ea','#7c3aed',
  '#4f46e5','#2563eb','#0891b2','#0d9488',
  '#16a34a','#ca8a04','#ea580c','#dc2626',
];

function getColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadAccounts() {
  return new Promise(resolve => {
    chrome.storage.local.get('accounts', data => resolve(data.accounts || []));
  });
}

// 전체 TOTP 업데이트 루프 — 1초마다 모든 카드 갱신
let totpTimer = null;

function startTotpLoop() {
  if (totpTimer) clearInterval(totpTimer);
  totpTimer = setInterval(updateAllTotp, 1000);
}

async function updateAllTotp() {
  const remaining = window.TOTP.totpRemaining();
  const circumference = 2 * Math.PI * 9; // r=9

  document.querySelectorAll('.totp-block[data-secret]').forEach(async block => {
    const secret = block.dataset.secret;
    const codeEl = block.querySelector('.totp-code');
    const countdownEl = block.querySelector('.totp-countdown');
    const ringBar = block.querySelector('.totp-ring-bar');

    try {
      // 주기가 바뀌는 순간(remaining==30)에만 코드 재생성
      if (remaining === 30 || !codeEl.textContent.trim().replace(' ','').match(/^\d{6}$/)) {
        const code = await window.TOTP.generateTOTP(secret);
        codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
      }
      countdownEl.textContent = remaining;
      const progress = remaining / 30;
      ringBar.style.strokeDasharray = circumference;
      ringBar.style.strokeDashoffset = circumference * (1 - progress);
      ringBar.style.stroke = remaining <= 5 ? '#ef4444' : '#22c55e';
      codeEl.style.color = remaining <= 5 ? '#ef4444' : '#4ade80';
    } catch (_) {
      codeEl.textContent = 'ERROR';
    }
  });
}

async function initTotp() {
  // 첫 렌더 후 모든 TOTP 블록에 초기값 채우기
  const remaining = window.TOTP.totpRemaining();
  const circumference = 2 * Math.PI * 9;

  for (const block of document.querySelectorAll('.totp-block[data-secret]')) {
    const secret = block.dataset.secret;
    const codeEl = block.querySelector('.totp-code');
    const countdownEl = block.querySelector('.totp-countdown');
    const ringBar = block.querySelector('.totp-ring-bar');
    try {
      const code = await window.TOTP.generateTOTP(secret);
      codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
    } catch (_) {
      codeEl.textContent = 'ERROR';
    }
    countdownEl.textContent = remaining;
    const progress = remaining / 30;
    ringBar.style.strokeDasharray = circumference;
    ringBar.style.strokeDashoffset = circumference * (1 - progress);
    ringBar.style.stroke = remaining <= 5 ? '#ef4444' : '#22c55e';
  }

  startTotpLoop();
}

function renderList(accounts, filter = '') {
  const list = document.getElementById('account-list');
  const filtered = filter
    ? accounts.filter(a =>
        a.name.toLowerCase().includes(filter.toLowerCase()) ||
        a.accountId.includes(filter)
      )
    : accounts;

  if (filtered.length === 0) {
    list.innerHTML = accounts.length === 0
      ? `<div class="empty-state"><p>등록된 계정이 없습니다.</p><button id="btn-add-first" class="btn-primary">+ 첫 계정 추가</button></div>`
      : `<div class="empty-state"><p>검색 결과가 없습니다.</p></div>`;
    document.getElementById('btn-add-first')?.addEventListener('click', openOptions);
    return;
  }

  const circumference = 2 * Math.PI * 9;

  list.innerHTML = filtered.map(acct => {
    const color = getColor(acct.name);
    const initials = getInitials(acct.name);
    const idx = accounts.indexOf(acct);
    const totpBlock = acct.mfaSecret ? `
      <div class="totp-block" data-secret="${escHtml(acct.mfaSecret)}">
        <span class="totp-code">······</span>
        <div class="totp-timer">
          <svg class="totp-ring" viewBox="0 0 20 20">
            <circle class="totp-ring-bg" cx="10" cy="10" r="9"/>
            <circle class="totp-ring-bar" cx="10" cy="10" r="9"
              style="stroke-dasharray:${circumference};stroke-dashoffset:0;transform:rotate(-90deg);transform-origin:50% 50%"/>
          </svg>
          <span class="totp-countdown">30</span>
        </div>
      </div>` : '';

    return `
      <div class="account-item" data-idx="${idx}">
        <div class="account-avatar" style="background:${color}">${initials}</div>
        <div class="account-info">
          <div class="account-name">${escHtml(acct.name)}</div>
          <div class="account-meta">${escHtml(acct.accountId)} · ${escHtml(acct.username)}</div>
          ${totpBlock}
        </div>
        <div class="account-actions">
          <button class="action-btn delete" data-idx="${idx}" title="삭제">🗑</button>
          <button class="action-btn" data-idx="${idx}" title="편집" data-action="edit">✏</button>
        </div>
        <button class="login-btn" data-idx="${idx}">로그인</button>
      </div>
    `;
  }).join('');

  // 이벤트 바인딩
  list.querySelectorAll('.login-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      doLogin(accounts[+btn.dataset.idx]);
    });
  });

  list.querySelectorAll('.account-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      doLogin(accounts[+item.dataset.idx]);
    });
  });

  list.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const idx = +btn.dataset.idx;
      if (!confirm(`"${accounts[idx].name}" 계정을 삭제하시겠습니까?`)) return;
      accounts.splice(idx, 1);
      chrome.storage.local.set({ accounts });
      renderList(accounts, document.getElementById('search').value);
      initTotp();
    });
  });

  list.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      chrome.runtime.openOptionsPage();
    });
  });

  // TOTP 코드 클릭 시 클립보드 복사
  list.querySelectorAll('.totp-code').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const raw = el.textContent.replace(/\s/g, '');
      if (/^\d{6}$/.test(raw)) {
        navigator.clipboard.writeText(raw);
        el.dataset.orig = el.textContent;
        el.textContent = '복사됨!';
        setTimeout(() => { el.textContent = el.dataset.orig; }, 1200);
      }
    });
  });

  initTotp();
}

function doLogin(acct) {
  const url = `https://signin.aws.amazon.com/signin?account=${encodeURIComponent(acct.accountId)}`;
  chrome.storage.local.set({ pendingLogin: acct }, () => {
    chrome.tabs.create({ url });
    window.close();
  });
}

function openOptions() {
  chrome.runtime.openOptionsPage();
  window.close();
}

document.addEventListener('DOMContentLoaded', async () => {
  const accounts = await loadAccounts();
  renderList(accounts);

  document.getElementById('search').addEventListener('input', e => {
    renderList(accounts, e.target.value);
  });

  document.getElementById('btn-add').addEventListener('click', openOptions);
  document.getElementById('btn-options').addEventListener('click', openOptions);
});
