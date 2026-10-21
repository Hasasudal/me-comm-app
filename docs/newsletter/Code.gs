/**
 * 미컴 라운지 뉴스레터 발송용 Google Apps Script 웹 앱
 * - Cloudflare Worker가 POST(JSON, text/plain)로 호출합니다.
 * - 메일은 이 스크립트를 배포한 관리자 Gmail 계정으로 발송됩니다.
 * 설치 방법은 같은 폴더의 README.md를 보세요.
 */

var SENDER_NAME = '미컴 라운지';
var MAX_MESSAGES = 20;      // 한 번 호출에 보낼 수 있는 최대 메일 수
var MAX_HTML = 200000;      // 본문 HTML 최대 글자 수 (Gmail 본문 한도가 약 200KB라 그보다 작게)
var EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

// 배포 확인용. 민감한 정보는 돌려주지 않습니다.
function doGet() {
  return json({ ok: true, service: 'micom-newsletter' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }
  if (!req || typeof req !== 'object') return json({ ok: false, error: 'bad_request' });

  // 비밀값 확인 (속성이 비어 있으면 무조건 거부)
  var secret = PropertiesService.getScriptProperties().getProperty('NEWSLETTER_SECRET');
  if (!secret || typeof req.secret !== 'string' || !safeEqual(req.secret, secret)) {
    return json({ ok: false, error: 'unauthorized' });
  }

  if (req.action === 'quota') {
    return json({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  }

  if (req.action === 'send') {
    var list = req.messages;
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_MESSAGES) {
      return json({ ok: false, error: 'bad_request' });
    }
    var results = [];
    var outOfQuota = false;
    for (var i = 0; i < list.length; i++) {
      var m = list[i] || {};
      var to = typeof m.to === 'string' ? m.to.trim() : '';
      if (!EMAIL_RE.test(to) || typeof m.subject !== 'string' || typeof m.html !== 'string') {
        results.push({ to: to, ok: false, error: 'invalid' });
        continue;
      }
      if (m.html.length > MAX_HTML) {
        results.push({ to: to, ok: false, error: 'too_large' });
        continue;
      }
      // 보내기 전에 남은 할당량 확인. 0이면 나머지는 보내지 않습니다.
      if (outOfQuota || MailApp.getRemainingDailyQuota() <= 0) {
        outOfQuota = true;
        results.push({ to: to, ok: false, error: 'quota' });
        continue;
      }
      try {
        MailApp.sendEmail({
          to: to,
          subject: m.subject.slice(0, 250),
          htmlBody: m.html,
          body: toPlainText(m.html),   // HTML을 못 보는 메일 앱용 텍스트
          name: SENDER_NAME
        });
        results.push({ to: to, ok: true });
      } catch (err) {
        results.push({ to: to, ok: false, error: String(err && err.message || err).slice(0, 200) });
      }
    }
    return json({ ok: true, results: results, remaining: MailApp.getRemainingDailyQuota() });
  }

  return json({ ok: false, error: 'bad_request' });
}

// 길이와 상관없이 끝까지 비교해서 비교 시간으로 비밀값이 새지 않게 합니다.
function safeEqual(a, b) {
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// HTML 태그를 걷어내 간단한 텍스트 본문을 만듭니다.
function toPlainText(html) {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// [처음 한 번 실행] 비밀값을 새로 만들어 저장하고 로그에 보여줍니다.
// 다시 실행하면 비밀값이 바뀌므로 Cloudflare 쪽 값도 새로 넣어야 합니다.
function setup() {
  var secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('NEWSLETTER_SECRET', secret);
  Logger.log('아래 비밀값을 복사해 Cloudflare의 NEWSLETTER_SCRIPT_SECRET에 넣으세요:');
  Logger.log(secret);
  Logger.log('오늘 남은 발송 가능 수: ' + MailApp.getRemainingDailyQuota());
}

// 오늘 남은 발송 가능 수(받는 사람 수 기준)를 로그로 확인합니다.
function testQuota() {
  Logger.log('오늘 남은 발송 가능 수: ' + MailApp.getRemainingDailyQuota());
}
