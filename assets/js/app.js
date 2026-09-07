/**
 * 화면 제어
 *
 * 입력이 바뀔 때마다 계산 엔진을 다시 돌리고 결과·안내·상담 버튼을 새로 그립니다.
 */

import { calculate, calcMinorYears } from './tax.js';
import { buildAdvice, judge, formatKRW } from './advice.js';
import { SITE, CONTACT, DISCLAIMER } from './config.js';
import { getLifeExpectancy, getDeductionYears, LIFE_TABLE_YEAR } from './life-table.js';

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
   나이를 넣으면 공제 연수가 자동으로 나오는 입력 목록

   장애인공제(기대여명)와 미성년자공제(19세까지 남은 햇수)가
   같은 방식으로 동작하므로 하나의 틀로 관리합니다.
   ──────────────────────────────────────────────────────────── */

let personSeq = 0;

/**
 * @param {object} options
 * @param {string} options.listId    행이 쌓일 컨테이너 id
 * @param {string} options.totalId   합계를 보여줄 요소 id
 * @param {boolean} options.withGender 성별 선택이 필요한지
 * @param {string} options.ageLabel  나이 입력창의 스크린리더용 이름
 * @param {Function} options.compute (age, gender) → { years, detail } 또는 null
 * @param {Function} options.summary (totalYears) → 합계 문구 HTML
 */
function createPersonList(options) {
  const { listId, totalId, withGender, ageLabel, compute, summary } = options;

  /** 입력된 사람별 계산 결과 */
  function read() {
    const people = [];
    document.querySelectorAll(`#${listId} .person-row`).forEach((row) => {
      const input = row.querySelector('.person-age');
      const gender = withGender
        ? row.querySelector('input[type="radio"]:checked').value
        : null;
      const age = Number(input.value);
      if (input.value === '' || !Number.isFinite(age) || age < 0) {
        people.push({ age: null, gender, years: 0, detail: null });
        return;
      }
      people.push({ age, gender, ...compute(age, gender) });
    });
    return people;
  }

  const totalYears = () => read().reduce((sum, p) => sum + p.years, 0);

  /** 각 행의 안내 문구와 합계를 다시 그립니다. */
  function render() {
    const people = read();
    const rows = document.querySelectorAll(`#${listId} .person-row`);

    people.forEach((p, i) => {
      const out = rows[i].querySelector('.person-result');
      if (p.age === null) {
        out.textContent = '나이를 입력하세요';
        out.classList.add('muted');
        return;
      }
      if (p.years === 0) {
        out.textContent = p.detail || '공제 대상이 아닙니다';
        out.classList.add('muted');
        return;
      }
      out.classList.remove('muted');
      out.innerHTML = `${p.detail} → 공제 <strong>${formatKRW(p.years * 1000 * 만원)}</strong>`;
    });

    const box = $(totalId);
    box.innerHTML = people.length === 0 ? '' : summary(people.reduce((s, p) => s + p.years, 0));
  }

  function add() {
    personSeq += 1;
    const name = `${listId}Gender${personSeq}`;
    const row = document.createElement('div');
    row.className = 'person-row';
    row.innerHTML = `
      <input type="number" class="person-age" min="0" max="120" step="1" placeholder="만 나이" aria-label="${ageLabel}">
      ${withGender ? `
      <div class="person-gender" role="radiogroup" aria-label="성별">
        <label><input type="radio" name="${name}" value="male" checked><span>남</span></label>
        <label><input type="radio" name="${name}" value="female"><span>여</span></label>
      </div>` : ''}
      <span class="person-result muted">나이를 입력하세요</span>
      <button type="button" class="person-remove" aria-label="이 항목 지우기">×</button>`;

    row.querySelector('.person-remove').addEventListener('click', () => {
      row.remove();
      update();
    });

    $(listId).appendChild(row);
    render();
    row.querySelector('.person-age').focus();
  }

  function clear() {
    $(listId).innerHTML = '';
    $(totalId).innerHTML = '';
  }

  return { read, render, add, clear, totalYears };
}

/** 장애인 상속인·동거가족 — 완전생명표의 성별·연령별 기대여명을 씁니다. */
const disabledPeople = createPersonList({
  listId: 'disabledList',
  totalId: 'disabledTotal',
  withGender: true,
  ageLabel: '장애인의 만 나이',
  compute: (age, gender) => {
    const expectancy = getLifeExpectancy(age, gender);
    return {
      years: getDeductionYears(age, gender) || 0,
      detail: `기대여명 <strong>${expectancy.toFixed(1)}년</strong>`,
    };
  },
  summary: (years) =>
    `합계 기대여명 <strong>${years}년</strong> · 장애인공제 <strong>${formatKRW(years * 1000 * 만원)}</strong>` +
    `<span class="source">${LIFE_TABLE_YEAR}년 완전생명표 기준 · 1년 미만은 1년으로 계산</span>`,
});

/** 미성년 자녀 — 19세가 될 때까지 남은 햇수를 씁니다. */
const minorChildren = createPersonList({
  listId: 'minorList',
  totalId: 'minorTotal',
  withGender: false,
  ageLabel: '미성년 자녀의 만 나이',
  compute: (age) => {
    const years = calcMinorYears(age) || 0;
    return {
      years,
      detail: years > 0
        ? `19세까지 <strong>${years}년</strong>`
        : '이미 19세 이상이라 미성년자공제 대상이 아닙니다',
    };
  },
  summary: (years) =>
    `합계 <strong>${years}년</strong> · 미성년자공제 <strong>${formatKRW(years * 1000 * 만원)}</strong>` +
    '<span class="source">자녀공제(1인당 5,000만원)와 함께 적용됩니다</span>',
});

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
    // 나이를 넣으면 자동으로 계산되는 항목들
    minorYears: minorChildren.totalYears(),
    elderlyCount: readNumber('elderlyCount'),
    disabledYears: disabledPeople.totalYears(),

    cohabitHouseValue: readMoney('cohabitHouseValue'),
    casualtyLoss: readMoney('casualtyLoss'),
    appraisalFee: readMoney('appraisalFee'),

    bequestToNonHeir: readMoney('bequestToNonHeir'),
    renouncedInheritance: readMoney('renouncedInheritance'),

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

/** 계산 결과를 보여줘도 되는 상태인지 (상속인 구성이 공제를 좌우하므로 먼저 받아야 합니다) */
function readiness(result) {
  return {
    heirs: readRadio('hasSpouse') !== '',
    assets: result.grossEstate > 0,
  };
}

function renderVerdict(result, ready) {
  const box = $('verdict');

  /** 아직 계산할 수 없는 상태의 안내 */
  const waiting = (badge, summary) => {
    box.dataset.level = 'empty';
    $('verdictBadge').textContent = badge;
    $('verdictAmount').innerHTML = '<span class="waiting">–</span>';
    $('verdictSummary').textContent = summary;
    $('subTaxBase').textContent = '-';
    $('subRate').textContent = '-';
    $('subHeadroomWrap').hidden = true;
  };

  // 상속인 구성에 따라 공제가 크게 달라지므로, 고르기 전에는 세액을 보여주지 않습니다.
  if (!ready.heirs) {
    waiting(
      '상속받는 분을 먼저 알려주세요',
      '배우자가 계신지, 자녀가 몇 명인지에 따라 공제 금액이 5억원 넘게 달라집니다. 1번 항목을 먼저 선택해 주세요.',
    );
    return;
  }

  if (!ready.assets) {
    waiting(
      '재산 금액을 입력해 주세요',
      '물려받는 재산을 만원 단위로 입력하면 예상 상속세가 바로 계산됩니다.',
    );
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
    // 어떤 근거로 이 금액이 나왔는지 함께 보여줍니다.
    rows.push(row(
      `법정상속분 ${(d.spouse.legalShare * 100).toFixed(1)}% 기준 한도`,
      d.spouse.legalShareLimit,
      { indent: true },
    ));
    if (d.spouse.applied === 'minimum') {
      rows.push(row('최소 공제액 적용', '실제 상속액이 적어 5억원 적용', { indent: true }));
    } else if (d.spouse.amount >= 30 * 100000000) {
      rows.push(row('상한 적용', '30억원 한도', { indent: true }));
    } else if (i.spouseActualInherit === null) {
      rows.push(row('가정', '배우자가 법정상속분만큼 상속받는 경우', { indent: true }));
    }
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

  // 상속공제 적용 한도 (상증법 제24조)
  const ld = d.limitDeductions;
  const hasLimitItem = ld.bequestToNonHeir > 0 || ld.renouncedInheritance > 0 || ld.priorGiftTaxBase > 0;
  if (d.capped || hasLimitItem) {
    rows.push(row('상속공제 적용 한도', d.limit));
    if (ld.bequestToNonHeir > 0) {
      rows.push(row('상속인이 아닌 사람에게 준 재산 차감', -ld.bequestToNonHeir, { indent: true }));
    }
    if (ld.renouncedInheritance > 0) {
      rows.push(row('상속포기로 넘어간 재산 차감', -ld.renouncedInheritance, { indent: true }));
    }
    if (ld.priorGiftTaxBase > 0) {
      rows.push(row('사전증여재산 과세표준 차감', -ld.priorGiftTaxBase, { indent: true }));
    }
    if (d.capped) {
      rows.push(row('한도 적용 결과', `공제 합계 ${formatKRW(d.sum)} → ${formatKRW(d.total)}`, { indent: true }));
    }
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

function renderAdvice(result, situation, ready) {
  if (!ready.heirs || !ready.assets) {
    $('adviceList').innerHTML = `
      <div class="advice" data-level="info">
        <h3>이 계산기로 무엇을 알 수 있나요</h3>
        <p>
          상속세가 나오는 구간인지, 나온다면 대략 얼마인지 확인할 수 있습니다.
          ${ready.heirs
            ? '물려받는 재산을 입력하면 결과가 바로 표시됩니다.'
            : '같은 재산이라도 배우자와 자녀가 있는지에 따라 세금이 완전히 달라지므로, 상속받는 분부터 여쭙습니다.'}
          <strong>상황 확인</strong>까지 체크하시면 신고 여부에 따라 달라지는 부분도 함께 알려드립니다.
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

  // 결과지를 먼저 저장하고 상담으로 넘어가는 순서로 배치합니다.
  buttons.push(
    '<button type="button" class="btn secondary" id="btnPdf">결과지 PDF로 저장하기</button>',
  );

  if (CONTACT.kakaoUrl) {
    buttons.push(
      `<a class="btn kakao" id="btnKakao" href="${CONTACT.kakaoUrl}" target="_blank" rel="noopener noreferrer">${CONTACT.kakaoLabel}</a>`,
    );
  }
  if (CONTACT.phone) {
    const tel = CONTACT.phone.replace(/[^\d+]/g, '');
    buttons.push(
      `<a class="btn phone" href="tel:${tel}">
         <span class="btn-main">${CONTACT.phoneLabel}</span>
         <span class="btn-sub">${CONTACT.phone}${CONTACT.representative ? ` · ${CONTACT.representative}` : ''}</span>
       </a>`,
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

  $('ctaBox').hidden = false;
  $('ctaTitle').textContent = CONTACT.ctaTitle;
  $('ctaBody').textContent = CONTACT.ctaBody;
  $('ctaButtons').innerHTML = buttons.join('');
  $('ctaHours').innerHTML = [
    CONTACT.hours ? `상담 가능 시간 ${CONTACT.hours}` : '',
    CONTACT.kakaoUrl
      ? '카카오톡 버튼을 누르면 상담 시작 알림이 카카오톡으로 전송됩니다. 카카오톡 앱에서 채팅을 이어가며 저장한 결과지를 첨부해 주세요.'
      : '',
  ].filter(Boolean).join('<br>');

  $('btnPdf').addEventListener('click', savePdf);

  const kakao = $('btnKakao');
  if (kakao) {
    // 채널 채팅이 열리는 동안, 붙여넣기만 하면 되도록 결과 요약을 복사해 둡니다.
    kakao.addEventListener('click', () => {
      copySummary().then((ok) => {
        showToast(ok
          ? '계산 결과를 복사했습니다. 카카오톡 채팅창에 붙여넣기만 하면 됩니다.'
          : '카카오톡으로 상담 시작 알림을 보냈습니다. 카카오톡 앱에서 확인해 주세요.');
      });
    });
  }
}

/* ────────────────────────────────────────────────────────────
   결과 요약 · 클립보드
   ──────────────────────────────────────────────────────────── */

/** 상담 시 그대로 붙여넣을 수 있는 요약문 */
function buildSummaryText() {
  const result = calculate(collectInput());
  const situation = collectSituation();
  const cards = result.grossEstate > 0 ? buildAdvice(result, situation) : [];
  const v = judge(result);

  const lines = [CONTACT.kakaoIntro, ''];
  lines.push(`총상속재산가액: ${formatKRW(result.grossEstate)}`);
  lines.push(`상속세 과세가액: ${formatKRW(result.taxableEstate)}`);
  lines.push(`상속공제 합계: ${formatKRW(result.deductions.total)}`);
  lines.push(`과세표준: ${formatKRW(result.taxBase)}`);
  lines.push(`예상 상속세: ${formatKRW(result.payableTax)}`);
  if (result.payableTax > 0) {
    lines.push(`적용 세율: ${Math.round(result.rate * 100)}%`);
  }
  lines.push('');
  lines.push(`판정: ${v.badge}`);

  const family = [];
  if (result.input.hasSpouse) family.push('배우자 있음');
  if (result.input.childrenCount > 0) family.push(`자녀 ${result.input.childrenCount}명`);
  if (result.input.disabledYears > 0) family.push(`장애인공제 대상 (기대여명 합계 ${result.input.disabledYears}년)`);
  if (family.length) {
    lines.push('');
    lines.push(`상속인: ${family.join(', ')}`);
  }

  if (situation.deathDate) lines.push(`상속개시일: ${situation.deathDate}`);
  if (situation.willSellRealEstate === 'yes') lines.push('부동산 양도 계획: 있음');
  else if (situation.willSellRealEstate === 'unsure') lines.push('부동산 양도 계획: 미정');

  const key = cards.filter((c) => c.cta).slice(0, 3);
  if (key.length) {
    lines.push('');
    lines.push('[확인이 필요한 사항]');
    key.forEach((c, i) => lines.push(`${i + 1}. ${c.title}`));
  }

  lines.push('');
  lines.push('※ 간단 계산기 결과이며 실제 세액과 다를 수 있습니다.');
  return lines.join('\n');
}

async function copySummary() {
  const text = buildSummaryText();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 대체 방법으로 넘어갑니다.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

let toastTimer = null;

function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 3800);
}

/* ────────────────────────────────────────────────────────────
   PDF 결과지
   ──────────────────────────────────────────────────────────── */

const CDN = {
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};

/** 버튼을 눌렀을 때만 내려받습니다. 계산기 첫 로딩을 무겁게 하지 않기 위함입니다. */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`불러오지 못했습니다: ${src}`));
    document.head.appendChild(el);
  });
}

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return {
    text: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
    file: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`,
  };
};

/**
 * 결과지에 넣을 "입력한 내용" 표.
 * 무엇을 넣고 계산한 결과인지 나중에도 확인할 수 있도록 값이 있는 항목을 모두 적습니다.
 */
function buildPdfInputs(result, situation) {
  const i = result.input;
  const groups = [];

  const group = (title, items) => {
    const rows = items.filter((it) => it && it[1]);
    if (rows.length) groups.push({ title, rows });
  };
  const money = (v) => (v > 0 ? formatKRW(v) : null);

  group('물려받는 재산', [
    ['부동산', money(i.realEstate)],
    ['금융재산', money(i.financialAssets)],
    ['그 밖의 재산', money(i.otherAssets)],
    ['간주상속재산', money(i.deemedAssets)],
    ['추정상속재산', money(i.presumedAssets)],
    ['합계', money(result.grossEstate)],
  ]);

  group('재산에서 빼는 것', [
    ['채무', money(i.debts)],
    ['그중 금융기관 채무', money(i.financialDebts)],
    ['공과금', money(i.publicCharges)],
    ['장례비용', formatKRW(result.funeralDeduction)],
    ['봉안시설·자연장지', money(i.burialCost)],
    ['비과세·불산입', money(i.nonTaxable)],
  ]);

  const minors = minorChildren.read().filter((p) => p.age !== null);
  const disabled = disabledPeople.read().filter((p) => p.age !== null);

  group('상속받는 사람', [
    ['배우자', i.hasSpouse ? '있음' : '없음'],
    ['배우자 실제 상속액', i.spouseActualInherit === null
      ? (i.hasSpouse ? '법정상속분 가정' : null)
      : formatKRW(i.spouseActualInherit)],
    ['자녀 수', i.childrenCount > 0 ? `${i.childrenCount}명` : null],
    ['미성년 자녀', minors.length
      ? minors.map((p) => `만 ${p.age}세(${p.years}년)`).join(', ')
      : null],
    ['연로자(65세 이상)', i.elderlyCount > 0 ? `${i.elderlyCount}명` : null],
    ['장애인', disabled.length
      ? disabled.map((p) => `만 ${p.age}세 ${p.gender === 'male' ? '남' : '여'}(기대여명 ${p.years}년)`).join(', ')
      : null],
  ]);

  group('그 밖에 입력한 값', [
    ['동거주택 가액', money(i.cohabitHouseValue)],
    ['10년 내 사전증여', money(i.priorGifts)],
    ['증여세 과세표준', money(i.priorGiftTaxBase)],
    ['기납부 증여세', money(i.priorGiftTaxPaid)],
    ['배우자 사전증여 과표', money(i.spousePriorGiftTaxBase)],
    ['감정평가수수료', money(i.appraisalFee)],
    ['재해손실', money(i.casualtyLoss)],
    ['상속인 외 유증재산', money(i.bequestToNonHeir)],
    ['상속포기 이전재산', money(i.renouncedInheritance)],
    ['세대생략 비율', i.generationSkipRatio > 0
      ? `${Math.round(i.generationSkipRatio * 100)}%` : null],
  ]);

  const sellText = { yes: '있다', unsure: '아직 모르겠다', no: '없다' }[situation.willSellRealEstate];
  const checks = [
    [situation.hadRecentWithdrawal, '돌아가시기 2년 이내 예금 인출·재산 처분·대출 있었음'],
    [situation.hasBusinessAsset, '사업체·농지를 물려받음'],
    [situation.hasUnlistedStock, '비상장회사 주식 포함'],
    [situation.hasGenerationSkip, '손자녀가 직접 물려받는 재산 있음'],
    [situation.hasDispute, '상속인 간 분할 협의가 어려움'],
  ].filter(([on]) => on).map(([, label]) => label);

  group('상황 확인', [
    ['상속개시일', situation.deathDate || null],
    ['부동산 양도 계획', sellText || null],
    ['해당 사항', checks.length ? checks.join(' / ') : null],
  ]);

  if (groups.length === 0) return '';

  return groups.map((g) => `
    <div class="pdf-input-group">
      <div class="pdf-input-title">${g.title}</div>
      <table class="pdf-input-table">
        ${g.rows.map(([label, value]) =>
          `<tr><th>${label}</th><td>${value}</td></tr>`).join('')}
      </table>
    </div>`).join('');
}

/** PDF로 옮길 결과지 화면을 만듭니다. */
function buildPdfSheet(result, situation, cards) {
  const v = judge(result);
  const date = today();

  const brand = SITE.logoUrl
    ? `<img src="${SITE.logoUrl}" alt="${SITE.officeName}" class="pdf-logo">`
    : `<div class="pdf-office">${SITE.officeName}</div>`;

  const family = [];
  if (result.input.hasSpouse) family.push('배우자');
  if (result.input.childrenCount > 0) family.push(`자녀 ${result.input.childrenCount}명`);
  if (result.input.minorYears > 0) family.push(`미성년자 공제 ${result.input.minorYears}년`);
  if (result.input.elderlyCount > 0) family.push(`연로자 ${result.input.elderlyCount}명`);
  if (result.input.disabledYears > 0) family.push(`장애인 기대여명 ${result.input.disabledYears}년`);

  const adviceHtml = cards.length
    ? cards.slice(0, 6).map((c) => `
        <div class="pdf-advice pdf-advice-${c.level}">
          <div class="pdf-advice-title">${c.title}</div>
          <div class="pdf-advice-body">${c.body}</div>
        </div>`).join('')
    : '<div class="pdf-advice"><div class="pdf-advice-body">해당되는 안내 사항이 없습니다.</div></div>';

  const meta = [];
  if (situation.deathDate) meta.push(`상속개시일 ${situation.deathDate}`);
  if (family.length) meta.push(`상속인 ${family.join(' · ')}`);
  if (situation.willSellRealEstate === 'yes') meta.push('부동산 양도 계획 있음');
  else if (situation.willSellRealEstate === 'unsure') meta.push('부동산 양도 계획 미정');

  const contactLines = [];
  if (CONTACT.phone) {
    contactLines.push(
      `유선상담 ${CONTACT.phone}${CONTACT.representative ? ` (${CONTACT.representative})` : ''}`,
    );
  }
  if (CONTACT.kakaoUrl) contactLines.push('카카오톡 채널 상담');
  if (CONTACT.email) contactLines.push(CONTACT.email);
  if (CONTACT.hours) contactLines.push(`상담 시간 ${CONTACT.hours}`);

  return `
    <div class="pdf-page">
      <div class="pdf-head">
        ${brand}
        <div class="pdf-head-right">
          <div class="pdf-title">상속세 예상 계산 결과지</div>
          <div class="pdf-date">작성일 ${date.text}</div>
        </div>
      </div>

      <div class="pdf-verdict pdf-verdict-${v.level}">
        <div class="pdf-verdict-badge">${v.badge}</div>
        <div class="pdf-verdict-amount">${Math.round(result.payableTax).toLocaleString('ko-KR')}원</div>
        <div class="pdf-verdict-summary">${v.summary}</div>
      </div>

      ${meta.length ? `<div class="pdf-meta">${meta.join(' &nbsp;|&nbsp; ')}</div>` : ''}

      <div class="pdf-section-title">입력한 내용</div>
      <div class="pdf-inputs">${buildPdfInputs(result, situation)}</div>

      <div class="pdf-section-title">계산 내역</div>
      <table class="pdf-table">${$('breakdownBody').innerHTML}</table>

      <div class="pdf-section-title">확인이 필요한 사항</div>
      ${adviceHtml}

      <div class="pdf-contact">
        <div class="pdf-contact-title">${SITE.officeName}${SITE.officeTagline ? ` · ${SITE.officeTagline}` : ''}</div>
        ${contactLines.length ? `<div class="pdf-contact-body">${contactLines.join(' &nbsp;|&nbsp; ')}</div>` : ''}
      </div>

      <div class="pdf-disclaimer">${DISCLAIMER}</div>
    </div>`;
}

let pdfBusy = false;

async function savePdf() {
  if (pdfBusy) return;
  const button = $('btnPdf');
  const result = calculate(collectInput());
  const ready = readiness(result);

  if (!ready.heirs) {
    showToast('상속받는 분(배우자가 계신지)을 먼저 선택해 주세요.');
    return;
  }
  if (!ready.assets) {
    showToast('먼저 재산 금액을 입력해 주세요.');
    return;
  }

  pdfBusy = true;
  const original = button.textContent;
  button.textContent = '결과지를 만드는 중…';
  button.disabled = true;

  try {
    await Promise.all([loadScript(CDN.html2canvas), loadScript(CDN.jspdf)]);

    const situation = collectSituation();
    const cards = buildAdvice(result, situation);
    const sheet = $('pdfSheet');
    sheet.innerHTML = buildPdfSheet(result, situation, cards);
    sheet.classList.add('rendering');

    const canvas = await window.html2canvas(sheet.querySelector('.pdf-page'), {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const margin = 10;
    const pageWidth = 210 - margin * 2;
    const pageHeight = 297 - margin * 2;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    const image = canvas.toDataURL('image/jpeg', 0.92);

    pdf.addImage(image, 'JPEG', margin, margin, pageWidth, imgHeight);

    // 한 장을 넘으면 같은 이미지를 위로 밀어가며 페이지를 이어 붙입니다.
    let remaining = imgHeight - pageHeight;
    while (remaining > 0) {
      pdf.addPage();
      pdf.addImage(image, 'JPEG', margin, margin - (imgHeight - remaining), pageWidth, imgHeight);
      remaining -= pageHeight;
    }

    pdf.save(`${SITE.officeName}_상속세계산결과_${today().file}.pdf`);
    sheet.classList.remove('rendering');
    sheet.innerHTML = '';

    showToast('결과지를 저장했습니다. 카카오톡 상담 신청 시 이 파일을 첨부해 주세요.');
  } catch (error) {
    console.error('[상속세 계산기] PDF 생성 실패', error);
    showToast('결과지를 만들지 못했습니다. 인쇄하기 버튼으로 저장해 주세요.');
  } finally {
    button.textContent = original;
    button.disabled = false;
    pdfBusy = false;
  }
}

/* ────────────────────────────────────────────────────────────
   메인 갱신 루프
   ──────────────────────────────────────────────────────────── */

function update() {
  disabledPeople.render();
  minorChildren.render();

  const input = collectInput();
  const situation = collectSituation();
  const result = calculate(input);
  const ready = readiness(result);

  renderVerdict(result, ready);
  renderAdvice(result, situation, ready);

  // 아직 다 채우지 않았으면 계산 내역을 감춥니다. 반쪽짜리 숫자가 오해를 부르기 때문입니다.
  const complete = ready.heirs && ready.assets;
  $('breakdown').hidden = !complete;
  if (complete) {
    renderBreakdown(result);
  } else {
    $('breakdownBody').innerHTML = '';
    $('breakdown').open = false;
  }

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
  // 화면 제목만 바꿉니다. 브라우저 탭 제목(<title>)은 검색 결과에 그대로 쓰이므로 건드리지 않습니다.
  if (SITE.title) $('siteTitle').textContent = SITE.title;
  if (SITE.subtitle) $('siteSubtitle').textContent = SITE.subtitle;
  $('disclaimer').textContent = DISCLAIMER;

  // 사무소 표시 — 로고 파일이 지정되어 있으면 로고를, 없으면 상호를 글자로 보여줍니다.
  const logo = $('brandLogo');
  const office = $('officeName');
  if (SITE.logoUrl) {
    logo.src = SITE.logoUrl;
    logo.alt = SITE.officeName || '';
    logo.hidden = false;
    logo.addEventListener('error', () => {
      // 로고를 불러오지 못하면 상호명으로 되돌립니다.
      logo.hidden = true;
      office.hidden = false;
      console.warn('[상속세 계산기] 로고 파일을 찾지 못했습니다:', SITE.logoUrl);
    });
    office.hidden = true;
  } else {
    office.textContent = SITE.officeName || '';
    office.hidden = !SITE.officeName;
  }

  const tagline = $('officeTagline');
  tagline.textContent = SITE.officeTagline || '';
  tagline.hidden = !SITE.officeTagline;

  $('brandBox').hidden = !SITE.officeName && !SITE.logoUrl;
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

  $('btnAddDisabled').addEventListener('click', disabledPeople.add);
  $('btnAddMinor').addEventListener('click', minorChildren.add);

  $('btnPrint').addEventListener('click', () => window.print());

  $('btnReset').addEventListener('click', () => {
    form.reset();
    disabledPeople.clear();
    minorChildren.clear();
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
