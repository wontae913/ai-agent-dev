// Service worker — 현재는 별도 로직 없음
// content.js가 signin 페이지에서 직접 pendingLogin을 읽어 처리함
chrome.runtime.onInstalled.addListener(() => {
  console.log('AWS Multi-Account Login 확장 설치 완료');
});
