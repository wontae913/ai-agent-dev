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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let accounts = [];
let editingIdx = null;
let mfaPreviewTimer = null;

async function load() {
  return new Promise(r => chrome.storage.local.get('accounts', d => {
    accounts = d.accounts || [];
    r();
  }));
}

function save() {
  return new Promise(r => chrome.storage.local.set({ accounts }, r));
}

function renderSidebar() {
  const el = document.getElementById('account-sidebar-list');
  if (accounts.length === 0) {
    el.innerHTML = '<div style="padding:16px 8px;color:#475569;font-size:12px;text-align:center;">계정 없음</div>';
    return;
  }
  el.innerHTML = accounts.map((a, i) => {
    const color = getColor(a.name);
    const initials = getInitials(a.name);
    const active = editingIdx === i ? ' active' : '';
    const mfaBadge = a.mfaSecret ? '<span class="mfa-badge">MFA</span>' : '';
    return `
      <div class="sidebar-item${active}" data-idx="${i}">
        <div class="sidebar-avatar" style="background:${color}">${escHtml(initials)}</div>
        <div>
          <div class="sidebar-name">${escHtml(a.name)} ${mfaBadge}</div>
          <div class="sidebar-sub">${escHtml(a.accountId)}</div>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => openEdit(+item.dataset.idx));
  });
}

// MFA 미리보기 타이머
function startMfaPreview(secret) {
  stopMfaPreview();
  const preview = document.getElementById('mfa-preview');
  const codeEl = document.getElementById('mfa-code');
  const countdownEl = document.getElementById('mfa-countdown');
  const ringBar = document.getElementById('mfa-ring-bar');
  const circumference = 2 * Math.PI * 11; // r=11

  ringBar.style.strokeDasharray = circumference;

  async function tick() {
    try {
      const code = await window.TOTP.generateTOTP(secret);
      const remaining = window.TOTP.totpRemaining();
      codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
      countdownEl.textContent = remaining;
      const progress = remaining / 30;
      ringBar.style.strokeDashoffset = circumference * (1 - progress);
      ringBar.style.stroke = remaining <= 5 ? '#ef4444' : '#22c55e';
    } catch (e) {
      codeEl.textContent = 'ERROR';
    }
  }

  preview.classList.remove('hidden');
  tick();
  mfaPreviewTimer = setInterval(tick, 1000);
}

function stopMfaPreview() {
  if (mfaPreviewTimer) {
    clearInterval(mfaPreviewTimer);
    mfaPreviewTimer = null;
  }
  document.getElementById('mfa-preview')?.classList.add('hidden');
}

function openNew() {
  editingIdx = null;
  stopMfaPreview();
  document.getElementById('form-title').textContent = '새 계정 추가';
  document.getElementById('f-name').value = '';
  document.getElementById('f-account-id').value = '';
  document.getElementById('f-username').value = '';
  document.getElementById('f-password').value = '';
  document.getElementById('f-mfa-secret').value = '';
  document.getElementById('f-note').value = '';
  document.getElementById('mfa-error').classList.add('hidden');
  document.getElementById('btn-delete').classList.add('hidden');
  document.getElementById('form-msg').textContent = '';
  document.getElementById('form-msg').className = 'form-msg';
  showForm();
  renderSidebar();
  document.getElementById('f-name').focus();
}

function openEdit(idx) {
  editingIdx = idx;
  stopMfaPreview();
  const a = accounts[idx];
  document.getElementById('form-title').textContent = '계정 편집';
  document.getElementById('f-name').value = a.name;
  document.getElementById('f-account-id').value = a.accountId;
  document.getElementById('f-username').value = a.username;
  document.getElementById('f-password').value = a.password;
  document.getElementById('f-mfa-secret').value = a.mfaSecret || '';
  document.getElementById('f-note').value = a.note || '';
  document.getElementById('mfa-error').classList.add('hidden');
  document.getElementById('btn-delete').classList.remove('hidden');
  document.getElementById('form-msg').textContent = '';
  document.getElementById('form-msg').className = 'form-msg';
  if (a.mfaSecret) startMfaPreview(a.mfaSecret);
  showForm();
  renderSidebar();
}

function showForm() {
  document.getElementById('form-area').classList.remove('hidden');
  document.getElementById('empty-main').classList.add('hidden');
}

function hideForm() {
  stopMfaPreview();
  document.getElementById('form-area').classList.add('hidden');
  document.getElementById('empty-main').classList.remove('hidden');
  editingIdx = null;
  renderSidebar();
}

function showMsg(msg, type) {
  const el = document.getElementById('form-msg');
  el.textContent = msg;
  el.className = `form-msg ${type}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await load();
  renderSidebar();

  document.getElementById('btn-new').addEventListener('click', openNew);
  document.getElementById('btn-cancel').addEventListener('click', hideForm);

  // 비밀번호 토글
  document.getElementById('btn-toggle-pw').addEventListener('click', () => {
    const pw = document.getElementById('f-password');
    const btn = document.getElementById('btn-toggle-pw');
    pw.type = pw.type === 'password' ? 'text' : 'password';
    btn.textContent = pw.type === 'password' ? '👁' : '🙈';
  });

  // MFA 비밀키 토글
  document.getElementById('btn-toggle-mfa').addEventListener('click', () => {
    const mfa = document.getElementById('f-mfa-secret');
    const btn = document.getElementById('btn-toggle-mfa');
    mfa.type = mfa.type === 'password' ? 'text' : 'password';
    btn.textContent = mfa.type === 'password' ? '👁' : '🙈';
  });

  // MFA 비밀키 입력 시 실시간 유효성 검사 + 미리보기
  let mfaDebounce = null;
  document.getElementById('f-mfa-secret').addEventListener('input', e => {
    const secret = e.target.value.trim();
    const errorEl = document.getElementById('mfa-error');
    stopMfaPreview();
    clearTimeout(mfaDebounce);
    if (!secret) { errorEl.classList.add('hidden'); return; }
    mfaDebounce = setTimeout(() => {
      if (!window.TOTP.isValidBase32(secret)) {
        errorEl.classList.remove('hidden');
      } else {
        errorEl.classList.add('hidden');
        startMfaPreview(secret);
      }
    }, 400);
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    const accountId = document.getElementById('f-account-id').value.trim();
    const username = document.getElementById('f-username').value.trim();
    const password = document.getElementById('f-password').value;
    const mfaSecret = document.getElementById('f-mfa-secret').value.trim().toUpperCase().replace(/\s/g, '') || '';
    const note = document.getElementById('f-note').value.trim();

    if (!name)      return showMsg('고객사 이름을 입력하세요.', 'error');
    if (!accountId) return showMsg('AWS 계정 ID를 입력하세요.', 'error');
    if (!/^\d{12}$/.test(accountId)) return showMsg('계정 ID는 12자리 숫자여야 합니다.', 'error');
    if (!username)  return showMsg('IAM 사용자 이름을 입력하세요.', 'error');
    if (!password)  return showMsg('비밀번호를 입력하세요.', 'error');
    if (mfaSecret && !window.TOTP.isValidBase32(mfaSecret)) return showMsg('MFA 비밀키 형식이 올바르지 않습니다.', 'error');

    const entry = { name, accountId, username, password, mfaSecret, note };

    if (editingIdx === null) {
      accounts.push(entry);
    } else {
      accounts[editingIdx] = entry;
    }

    await save();
    renderSidebar();
    showMsg('저장되었습니다.', 'success');

    if (editingIdx === null) {
      editingIdx = accounts.length - 1;
      document.getElementById('form-title').textContent = '계정 편집';
      document.getElementById('btn-delete').classList.remove('hidden');
      renderSidebar();
    }
  });

  document.getElementById('btn-delete').addEventListener('click', async () => {
    if (editingIdx === null) return;
    const name = accounts[editingIdx].name;
    if (!confirm(`"${name}" 계정을 삭제하시겠습니까?`)) return;
    accounts.splice(editingIdx, 1);
    await save();
    hideForm();
  });
});
