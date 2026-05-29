// RFC 6238 TOTP — WebCrypto 기반, 외부 의존 없음

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret) {
  const s = secret.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  const bits = Array.from(s).map(c => {
    const idx = BASE32_CHARS.indexOf(c);
    if (idx === -1) throw new Error(`Invalid base32 char: ${c}`);
    return idx.toString(2).padStart(5, '0');
  }).join('');

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(keyBytes, counterBytes) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, counterBytes);
  return new Uint8Array(sig);
}

function counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // 64비트 big-endian — JS 숫자는 53비트 안전 정수이므로 상위 4바이트는 0
  view.setUint32(0, Math.floor(counter / 2 ** 32), false);
  view.setUint32(4, counter >>> 0, false);
  return new Uint8Array(buf);
}

async function generateTOTP(secret, digits = 6, period = 30) {
  const keyBytes = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);
  const hash = await hmacSha1(keyBytes, counterToBytes(counter));

  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset]     & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) <<  8) |
     (hash[offset + 3] & 0xff)
  ) % (10 ** digits);

  return String(code).padStart(digits, '0');
}

// 현재 주기에서 남은 초 (0~29)
function totpRemaining(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period);
}

// base32 유효성 검사
function isValidBase32(s) {
  return /^[A-Z2-7\s=]+$/i.test(s.trim());
}

// 팝업/options 양쪽에서 사용 가능하도록 전역 노출
if (typeof window !== 'undefined') {
  window.TOTP = { generateTOTP, totpRemaining, isValidBase32 };
}
