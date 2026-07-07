const CSV_FIELDS = ['name', 'accountId', 'username', 'password', 'mfaSecret', 'note'];

function toCsv(accounts) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const header = CSV_FIELDS.join(',');
  const rows = accounts.map(a => CSV_FIELDS.map(f => esc(a[f])).join(','));
  return [header, ...rows].join('\r\n');
}

function fromCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCsvRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

// RFC 4180 호환 CSV 행 파서 (큰따옴표 이스케이프 처리)
function parseCsvRow(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

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

let dragSrcIdx = null;

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
      <div class="sidebar-item${active}" data-idx="${i}" draggable="true">
        <div class="drag-handle" title="드래그하여 순서 변경">⠿</div>
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

    item.addEventListener('dragstart', e => {
      dragSrcIdx = +item.dataset.idx;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      el.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('drag-over'));
    });

    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });

    item.addEventListener('drop', async e => {
      e.preventDefault();
      const targetIdx = +item.dataset.idx;
      if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

      const moved = accounts.splice(dragSrcIdx, 1)[0];
      accounts.splice(targetIdx, 0, moved);

      if (editingIdx === dragSrcIdx) editingIdx = targetIdx;
      else if (editingIdx !== null) {
        if (dragSrcIdx < editingIdx && targetIdx >= editingIdx) editingIdx--;
        else if (dragSrcIdx > editingIdx && targetIdx <= editingIdx) editingIdx++;
      }

      dragSrcIdx = null;
      await save();
      renderSidebar();
    });
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

  // Ctrl+Alt+N → '새 계정 추가' 폼 열기 (관리 페이지에서 동작)
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.altKey && !e.shiftKey && e.code === 'KeyN') {
      e.preventDefault();
      openNew();
    }
  });

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

  // ── Export ──
  document.getElementById('btn-export').addEventListener('click', () => {
    if (accounts.length === 0) return alert('내보낼 계정이 없습니다.');
    const fmt = confirm('확인 → JSON\n취소 → CSV') ? 'json' : 'csv';
    const date = new Date().toISOString().slice(0, 10);
    let blob, filename;
    if (fmt === 'json') {
      blob = new Blob([JSON.stringify({ version: 1, accounts }, null, 2)], { type: 'application/json' });
      filename = `aws-accounts-${date}.json`;
    } else {
      blob = new Blob([toCsv(accounts)], { type: 'text/csv;charset=utf-8;' });
      filename = `aws-accounts-${date}.csv`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Import ──
  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    let incoming;
    try {
      const text = await file.text();
      if (file.name.endsWith('.csv')) {
        incoming = fromCsv(text);
      } else {
        const parsed = JSON.parse(text);
        incoming = parsed.accounts ?? (Array.isArray(parsed) ? parsed : null);
        if (!incoming) return alert('계정 데이터를 찾을 수 없습니다.');
      }
    } catch (err) {
      return alert(`파일을 읽을 수 없습니다.\n${err.message}`);
    }

    const valid = incoming.filter(a => a.name && a.accountId && a.username && a.password);
    if (valid.length === 0) return alert('유효한 계정이 없습니다.\n필수 열: name, accountId, username, password');

    const skipped = incoming.length - valid.length;
    const dupes = valid.filter(a => accounts.some(x => x.accountId === a.accountId));
    let overwrite = false;
    if (dupes.length > 0) {
      overwrite = confirm(`중복된 계정 ${dupes.length}개가 있습니다.\n\n확인 → 덮어쓰기\n취소 → 새 계정만 추가`);
    }

    let added = 0, updated = 0;
    for (const a of valid) {
      const idx = accounts.findIndex(x => x.accountId === a.accountId);
      if (idx === -1) { accounts.push(a); added++; }
      else if (overwrite) { accounts[idx] = a; updated++; }
    }

    await save();
    renderSidebar();
    hideForm();

    const parts = [];
    if (added)   parts.push(`추가 ${added}개`);
    if (updated) parts.push(`업데이트 ${updated}개`);
    if (skipped) parts.push(`건너뜀 ${skipped}개`);
    alert(`가져오기 완료\n${parts.join(' / ')}`);
  });
});
