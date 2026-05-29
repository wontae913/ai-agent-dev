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
    return `
      <div class="sidebar-item${active}" data-idx="${i}">
        <div class="sidebar-avatar" style="background:${color}">${escHtml(initials)}</div>
        <div>
          <div class="sidebar-name">${escHtml(a.name)}</div>
          <div class="sidebar-sub">${escHtml(a.accountId)}</div>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => openEdit(+item.dataset.idx));
  });
}

function openNew() {
  editingIdx = null;
  document.getElementById('form-title').textContent = '새 계정 추가';
  document.getElementById('f-name').value = '';
  document.getElementById('f-account-id').value = '';
  document.getElementById('f-username').value = '';
  document.getElementById('f-password').value = '';
  document.getElementById('f-note').value = '';
  document.getElementById('btn-delete').classList.add('hidden');
  document.getElementById('form-msg').textContent = '';
  document.getElementById('form-msg').className = 'form-msg';
  showForm();
  renderSidebar();
  document.getElementById('f-name').focus();
}

function openEdit(idx) {
  editingIdx = idx;
  const a = accounts[idx];
  document.getElementById('form-title').textContent = '계정 편집';
  document.getElementById('f-name').value = a.name;
  document.getElementById('f-account-id').value = a.accountId;
  document.getElementById('f-username').value = a.username;
  document.getElementById('f-password').value = a.password;
  document.getElementById('f-note').value = a.note || '';
  document.getElementById('btn-delete').classList.remove('hidden');
  document.getElementById('form-msg').textContent = '';
  document.getElementById('form-msg').className = 'form-msg';
  showForm();
  renderSidebar();
}

function showForm() {
  document.getElementById('form-area').classList.remove('hidden');
  document.getElementById('empty-main').classList.add('hidden');
}

function hideForm() {
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

  document.getElementById('btn-toggle-pw').addEventListener('click', () => {
    const pw = document.getElementById('f-password');
    const btn = document.getElementById('btn-toggle-pw');
    if (pw.type === 'password') {
      pw.type = 'text';
      btn.textContent = '🙈';
    } else {
      pw.type = 'password';
      btn.textContent = '👁';
    }
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    const accountId = document.getElementById('f-account-id').value.trim();
    const username = document.getElementById('f-username').value.trim();
    const password = document.getElementById('f-password').value;
    const note = document.getElementById('f-note').value.trim();

    if (!name)      return showMsg('고객사 이름을 입력하세요.', 'error');
    if (!accountId) return showMsg('AWS 계정 ID를 입력하세요.', 'error');
    if (!/^\d{12}$/.test(accountId)) return showMsg('계정 ID는 12자리 숫자여야 합니다.', 'error');
    if (!username)  return showMsg('IAM 사용자 이름을 입력하세요.', 'error');
    if (!password)  return showMsg('비밀번호를 입력하세요.', 'error');

    const entry = { name, accountId, username, password, note };

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
