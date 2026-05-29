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

function maskPassword(pw) {
  return '••••••••';
}

async function loadAccounts() {
  return new Promise(resolve => {
    chrome.storage.local.get('accounts', data => resolve(data.accounts || []));
  });
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

  list.innerHTML = filtered.map((acct, i) => {
    const color = getColor(acct.name);
    const initials = getInitials(acct.name);
    const idx = accounts.indexOf(acct);
    return `
      <div class="account-item" data-idx="${idx}">
        <div class="account-avatar" style="background:${color}">${initials}</div>
        <div class="account-info">
          <div class="account-name">${escHtml(acct.name)}</div>
          <div class="account-meta">${escHtml(acct.accountId)} · ${escHtml(acct.username)}</div>
        </div>
        <div class="account-actions">
          <button class="action-btn delete" data-idx="${idx}" title="삭제">🗑</button>
          <button class="action-btn" data-idx="${idx}" title="편집" data-action="edit">✏</button>
        </div>
        <button class="login-btn" data-idx="${idx}">로그인</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.login-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const acct = accounts[+btn.dataset.idx];
      doLogin(acct);
    });
  });

  list.querySelectorAll('.account-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const acct = accounts[+item.dataset.idx];
      doLogin(acct);
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
    });
  });

  list.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      chrome.runtime.openOptionsPage();
    });
  });
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

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
