/**
 * 화면 제어
 *
 * 입력이 바뀔 때마다 계산 엔진을 다시 돌리고 결과·안내·상담 버튼을 새로 그립니다.
 */

import { calculate } from './tax.js';
import { buildAdvice, judge, formatKRW } from './advice.js';
import { SITE, CONTACT, DISCLAIMER } from './config.js';

/** 화면 입력은 만원 단위, 계산 엔진은 원 단위 */
const 만원 = 10000;

const $ = (id) => document.getElementById(id);

/* ────────────────────────────────────────────────────────────
   금액 입력 처리
   ──────────────────────────────────────────────────────────── */

const digitsOnly = (s) => String(s).replace(/[^\d]/g, '');
const withCommas = (s) => (s ? Number(s).toLocaleString('ko-KR') : '');

/** 만원 단위 입력값을 원 단위 숫자로 */
function readMoney(id) {
  const el = $(id);
  if (!el) return 0;
  const raw = digitsOnly(el.value);
  return raw === '' ? 0 : Number(raw) * 만원;
}

/** 값을 입력하지 않았으면 null (배우자 실제 상속액처럼 "미입력"과 "0"을 구분해야 하는 곳) */
function readMoneyOrNull(id) {
  const el = $(id);
  if (!el) return null;
  const raw = digitsOnly(el.value);
  return raw === '' ? null : Number(raw) * 만원;
}

function readNumber(id) {
  const el = $(id);
  if (!el) return 0;
  const n = Number(el.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const isChecked = (id) => Boolean($(id) && $(id).checked);

const readRadio = (name) => {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
};

/** 입력창에 콤마를 넣으면서 커서 위치를 유지합니다. */
function formatMoneyInput(input) {
  const posFromEnd = input.value.length - (input.selectionStart ?? input.value.length);
  const formatted = withCommas(digitsOnly(input.value));
  if (formatted !== input.value) {
    input.value = formatted;
    if (document.activeElement === input) {
      const pos = Math.max(0, formatted.length - posFromEnd);
      input.setSelectionRange(pos, pos);
    }
  }
}

/** 입력창 아래에 "5억원" 같은 읽기 쉬운 금액을 표시합니다. */
function updateEcho(id) {
  const echo = document.querySelector(`[data-echo-for="${id}"]`);
  if (!echo) return;
  const raw = digitsOnly($(id).value);
  echo.textContent = raw === '' || Number(raw) === 0 ? '' : formatKRW(Number(raw) * 만원);
}

/* ────────────────────────────────────────────────────────────
   입력 수집
   ──────────────────────────────────────────────────────────── */

function collectInput() {
  const hasSpouse = readRadio('hasSpouse') === 'yes';
  return {
    realEstate: readMoney('realEstate'),
    financialAssets: readMoney('financialAssets'),
    otherAssets: readMoney('otherAssets'),
    deemedAssets: readMoney('deemedAssets'),
    presumedAssets: readMoney('presumedAssets'),

    nonTaxable: readMoney('nonTaxable'),
    publicCharges: readMoney('publicCharges'),
    funeralCost: readMoney('funeralCost'),
    burialCost: readMoney('burialCost'),
    debts: readMoney('debts'),
    financialDebts: readMoney('financialDebts'),

    priorGifts: readMoney('priorGifts'),
    priorGiftTaxBase: readMoney('priorGiftTaxBase'),
    spousePriorGiftTaxBase: readMoney('spousePriorGiftTaxBase'),
    priorGiftTaxPaid: readMoney('priorGiftTaxPaid'),

    hasSpouse,
    spouseActualInherit: hasSpouse ? readMoneyOrNull('spouseActualInherit') : null,
    childrenCount: readNumber('childrenCount'),
    minorYears: readNumber('minorYears'),
    elderlyCount: readNumber('elderlyCount'),
    disabledYears: readNumber('disabledYears'),

    cohabitHouseValue: readMoney('cohabitHouseValue'),
    casualtyLoss: readMoney('casualtyLoss'),
    appraisalFee: readMoney('appraisalFee'),

    generationSkipRatio: readNumber('generationSkipRatio') / 100,
  };
}

function collectSituation() {
  return {
    willSellRealEstate: readRadio('willSellRealEstate'),
    deathDate: $('deathDate').value,
    hadRecentWithdrawal: isChecked('hadRecentWithdrawal'),
    hasBusinessAsset: isChecked('hasBusinessAsset'),
    hasUnlistedStock: isChecked('hasUnlistedStock'),
    hasGenerationSkip: isChecked('hasGenerationSkip'),
    hasDispute: isChecked('hasDispute'),
  };
}

/* ────────────────────────────────────────────────────────────
   결과 렌더링
   ──────────────────────────────────────────────────────────── */

function renderVerdict(result) {
  const box = $('verdict');

  // 아직 아무것도 입력하지 않았으면 판정 대신 안내만 보여줍니다.
  if (result.grossEstate === 0) {
    box.dataset.level = 'empty';
    $('verdictBadge').textContent = '재산 금액을 입력해 주세요';
    $('verdictAmount').innerHTML = '0<span class="won">원</span>';
    $('verdictSummary').textContent =
      '왼쪽에 물려받는 재산을 만원 단위로 입력하면 예상 상속세가 바로 계산됩니다.';
    $('subTaxBase').textContent = '0원';
    $('subRate').textContent = '-';
    $('subHeadroomWrap').hidden = true;
    return;
  }

  const v = judge(result);
  box.dataset.level = v.level;
  $('verdictBadge').textContent = v.badge;
  $('verdictAmount').innerHTML =
    `${Math.round(result.payableTax).toLocaleString('ko-KR')}<span class="won">원</span>`;
  $('verdictSummary').textContent = v.summary;

  $('subTaxBase').textContent = formatKRW(result.taxBase);
  $('subRate').textContent = result.taxBase > 0 ? `${Math.round(result.rate * 100)}%` : '-';

  const headroomWrap = $('subHeadroomWrap');
  if (result.payableTax > 0) {
    headroomWrap.hidden = true;
  } else {
    headroomWrap.hidden = false;
    $('subHeadroom').textContent = formatKRW(result.headroom);
  }
}

/** 계산 내역 테이블 한 줄 */
function row(label, value, options = {}) {
  const cls = [options.className, options.indent ? 'indent' : ''].filter(Boolean).join(' ');
  const amount = typeof value === 'string' ? value : formatKRW(value);
  return `<tr class="${cls}"><th scope="row">${label}</th><td>${amount}</td></tr>`;
}

function renderBreakdown(result) {
  const d = result.deductions;
  const i = result.input;
  const rows = [];

  rows.push(row('총상속재산가액', result.grossEstate, { className: 'sum' }));
  const assetRows = [
    ['부동산', i.realEstate],
    ['금융재산', i.financialAssets],
    ['그 밖의 재산', i.otherAssets],
    ['간주상속재산', i.deemedAssets],
    ['추정상속재산', i.presumedAssets],
  ];
  assetRows.forEach(([label, v]) => {
    if (v > 0) rows.push(row(label, v, { indent: true }));
  });

  if (result.nonTaxable > 0) {
    rows.push(row('비과세·과세가액 불산입', -result.nonTaxable, { className: 'minus' }));
  }
  rows.push(row('공과금·장례비용·채무', -result.charges, { className: 'minus' }));
  if (i.publicCharges > 0) rows.push(row('공과금', i.publicCharges, { indent: true }));
  rows.push(row('장례비용', result.funeralDeduction, { indent: true }));
  if (i.debts > 0) rows.push(row('채무', i.debts, { indent: true }));

  if (result.priorGifts > 0) {
    rows.push(row('사전증여재산 가산', result.priorGifts));
  }

  rows.push(row('상속세 과세가액', result.taxableEstate, { className: 'sum' }));

  const basicLabel = d.basicRouteName === 'lumpSum'
    ? '일괄공제'
    : '기초공제 + 그 밖의 인적공제';
  rows.push(row(basicLabel, -d.basicTotal, { className: 'minus' }));
  if (d.basicRouteName === 'basic') {
    rows.push(row('기초공제', 2 * 100000000, { indent: true }));
    if (d.personal.child > 0) rows.push(row('자녀공제', d.personal.child, { indent: true }));
    if (d.personal.minor > 0) rows.push(row('미성년자공제', d.personal.minor, { indent: true }));
    if (d.personal.elderly > 0) rows.push(row('연로자공제', d.personal.elderly, { indent: true }));
    if (d.personal.disabled > 0) rows.push(row('장애인공제', d.personal.disabled, { indent: true }));
  }

  if (d.spouse.amount > 0) {
    rows.push(row('배우자 상속공제', -d.spouse.amount, { className: 'minus' }));
  }
  if (d.financial.amount > 0) {
    rows.push(row('금융재산 상속공제', -d.financial.amount, { className: 'minus' }));
  }
  if (d.cohabitHouse > 0) {
    rows.push(row('동거주택 상속공제', -d.cohabitHouse, { className: 'minus' }));
  }
  if (d.casualtyLoss > 0) {
    rows.push(row('재해손실공제', -d.casualtyLoss, { className: 'minus' }));
  }
  if (d.capped) {
    rows.push(row('공제 한도 적용', `공제 합계 ${formatKRW(d.sum)} → ${formatKRW(d.total)}`, { indent: true }));
  }
  if (result.appraisalFee > 0) {
    rows.push(row('감정평가수수료', -result.appraisalFee, { className: 'minus' }));
  }

  rows.push(row('상속세 과세표준', result.taxBase, { className: 'sum' }));

  if (result.taxBase > 0) {
    rows.push(row(
      '적용 세율',
      `${Math.round(result.rate * 100)}% (누진공제 ${formatKRW(result.progressive)})`,
      { indent: true },
    ));
  }
  rows.push(row('산출세액', result.calculatedTax, { className: 'sum' }));

  if (result.generationSkipSurcharge > 0) {
    rows.push(row('세대생략 할증세액', result.generationSkipSurcharge));
  }
  if (result.giftTaxCredit > 0) {
    rows.push(row('증여세액공제', -result.giftTaxCredit, { className: 'minus' }));
  }
  if (result.reportCredit > 0) {
    rows.push(row('신고세액공제 (3%)', -result.reportCredit, { className: 'minus' }));
  }

  rows.push(row('납부할 상속세', result.payableTax, { className: 'sum' }));

  if (result.payableTax > 0) {
    rows.push(row(
      '총재산 대비 실효세율',
      `${(result.effectiveRate * 100).toFixed(1)}%`,
      { indent: true },
    ));
  }

  $('breakdownBody').innerHTML = rows.join('');
}

function renderAdvice(result, situation) {
  if (result.grossEstate === 0) {
    $('adviceList').innerHTML = `
      <div class="advice" data-level="info">
        <h3>이 계산기로 무엇을 알 수 있나요</h3>
        <p>
          상속세가 나오는 구간인지, 나온다면 대략 얼마인지 확인할 수 있습니다.
          아래 <strong>상황 확인</strong>까지 체크하시면 신고 여부에 따라 달라지는 부분도 함께 알려드립니다.
        </p>
      </div>`;
    return [];
  }

  const cards = buildAdvice(result, situation);
  $('adviceList').innerHTML = cards
    .map(
      (c) => `
      <div class="advice" data-level="${c.level}">
        <h3>${c.title}</h3>
        <p>${c.body}</p>
      </div>`,
    )
    .join('');
  return cards;
}

/* ────────────────────────────────────────────────────────────
   상담 버튼
   ──────────────────────────────────────────────────────────── */

function renderContact() {
  const buttons = [];

  if (CONTACT.phone) {
    const tel = CONTACT.phone.replace(/[^\d+]/g, '');
    buttons.push(
      `<a class="btn" href="tel:${tel}">${CONTACT.phoneLabel} ${CONTACT.phone}</a>`,
    );
  }
  if (CONTACT.kakaoUrl) {
    buttons.push(
      `<a class="btn kakao" href="${CONTACT.kakaoUrl}" target="_blank" rel="noopener noreferrer">${CONTACT.kakaoLabel}</a>`,
    );
  }
  if (CONTACT.formUrl) {
    buttons.push(
      `<a class="btn secondary" href="${CONTACT.formUrl}" target="_blank" rel="noopener noreferrer">${CONTACT.formLabel}</a>`,
    );
  }
  if (CONTACT.email) {
    buttons.push(
      `<a class="btn secondary" href="mailto:${CONTACT.email}?subject=${encodeURIComponent('상속세 상담 문의')}">${CONTACT.emailLabel}</a>`,
    );
  }

  const box = $('ctaBox');
  if (buttons.length === 0) {
    // 연락처를 설정하지 않았으면 상담 영역을 통째로 숨깁니다.
    box.hidden = true;
    console.warn(
      '[상속세 계산기] assets/js/config.js 의 CONTACT에 전화번호나 카카오톡 채널 주소를 입력하면 상담 버튼이 표시됩니다.',
    );
    return;
  }

  box.hidden = false;
  $('ctaTitle').textContent = CONTACT.ctaTitle;
  $('ctaBody').textContent = CONTACT.ctaBody;
  $('ctaButtons').innerHTML = buttons.join('');
  $('ctaHours').textContent = CONTACT.hours ? `상담 가능 시간: ${CONTACT.hours}` : '';
}

/* ────────────────────────────────────────────────────────────
   메인 갱신 루프
   ──────────────────────────────────────────────────────────── */

function update() {
  const input = collectInput();
  const situation = collectSituation();
  const result = calculate(input);

  renderVerdict(result);
  renderBreakdown(result);
  renderAdvice(result, situation);

  // 배우자를 선택했을 때만 "실제 상속받는 금액" 입력을 보여줍니다.
  $('spouseInheritField').hidden = !input.hasSpouse;

  notifyHeight();
}

/* ────────────────────────────────────────────────────────────
   iframe 임베드 지원
   ──────────────────────────────────────────────────────────── */

const isEmbedded = window.parent !== window;
let lastHeight = 0;
let heightTimer = null;

/**
 * 부모 창에 문서 높이를 알려 iframe 높이를 맞추게 합니다.
 *
 * 부모가 높이를 바꾸면 이쪽 레이아웃도 다시 바뀌므로, 크기 변화를 자동으로 감시하면
 * 서로를 계속 깨우는 상태에 빠집니다. 그래서 값이 실제로 바뀐 시점에만,
 * 그것도 잠깐 모아서 한 번씩 알립니다.
 */
function notifyHeight() {
  if (!isEmbedded) return;
  clearTimeout(heightTimer);
  heightTimer = setTimeout(() => {
    const height = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(height - lastHeight) < 24) return;
    lastHeight = height;
    window.parent.postMessage({ type: 'inheritance-calculator:height', height }, '*');
  }, 150);
}

/* ────────────────────────────────────────────────────────────
   초기화
   ──────────────────────────────────────────────────────────── */

function applyConfig() {
  if (SITE.title) {
    $('siteTitle').textContent = SITE.title;
    document.title = SITE.title;
  }
  if (SITE.subtitle) $('siteSubtitle').textContent = SITE.subtitle;
  $('disclaimer').textContent = DISCLAIMER;

  const office = $('officeName');
  if (SITE.officeName) {
    office.textContent = SITE.officeName;
  } else {
    office.hidden = true;
  }
}

function bindEvents() {
  const form = $('calcForm');

  // 금액 입력: 콤마 자동 삽입 + 아래에 읽기 쉬운 금액 표시
  document.querySelectorAll('input[data-money]').forEach((input) => {
    input.addEventListener('input', () => {
      formatMoneyInput(input);
      updateEcho(input.id);
      update();
    });
  });

  // 그 밖의 입력은 값이 바뀌면 바로 다시 계산
  form.addEventListener('input', (e) => {
    if (e.target.matches('input[data-money]')) return; // 위에서 이미 처리
    update();
  });
  form.addEventListener('change', () => update());

  // 숫자 증감 버튼
  document.querySelectorAll('button[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.step);
      const delta = Number(btn.dataset.delta);
      const min = Number(input.min || 0);
      const max = Number(input.max || Infinity);
      input.value = Math.min(max, Math.max(min, (Number(input.value) || 0) + delta));
      update();
    });
  });

  // 자녀 수 옆 안내 문구
  const children = $('childrenCount');
  const childrenEcho = document.querySelector('[data-echo-for="childrenCount"]');
  const syncChildrenEcho = () => {
    childrenEcho.textContent = Number(children.value) > 0 ? '명' : '명 (자녀 없음)';
  };
  children.addEventListener('input', syncChildrenEcho);
  syncChildrenEcho();

  $('btnPrint').addEventListener('click', () => window.print());

  $('btnReset').addEventListener('click', () => {
    form.reset();
    document.querySelectorAll('input[data-money]').forEach((input) => {
      input.value = '';
      updateEcho(input.id);
    });
    document.querySelectorAll('details.more').forEach((d) => { d.open = false; });
    $('breakdown').open = false;
    syncChildrenEcho();
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // iframe으로 삽입했을 때만 높이를 알려주면 됩니다.
  // 접기/펼치기처럼 계산과 무관하게 높이가 변하는 동작도 함께 잡아줍니다.
  if (isEmbedded) {
    window.addEventListener('resize', notifyHeight);
    document.querySelectorAll('details').forEach((el) => {
      el.addEventListener('toggle', notifyHeight);
    });
  }
}

function init() {
  // ?embed=1 로 열면 블로그에 끼워 넣기 좋은 형태로 표시합니다.
  if (new URLSearchParams(location.search).has('embed')) {
    document.body.classList.add('embed');
  }

  applyConfig();
  renderContact();
  bindEvents();
  update();
}

init();
