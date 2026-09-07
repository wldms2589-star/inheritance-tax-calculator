import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculate,
  applyRate,
  calcFinancialDeduction,
  calcFuneralDeduction,
  calcSpouseLegalShare,
  calcPersonalDeduction,
  calcMinorYears,
} from '../assets/js/tax.js';
import { TAX_RULES } from '../assets/js/tax-rules.js';

const 억 = 100000000;
const 만 = 10000;

/** 부동소수점 오차를 감안한 금액 비교 (1원 이내) */
const eq = (actual, expected, msg) =>
  assert.ok(
    Math.abs(actual - expected) < 1,
    `${msg || ''} 기대 ${expected.toLocaleString()}원, 실제 ${Math.round(actual).toLocaleString()}원`,
  );

test('세율 구간별 산출세액이 누진공제 방식과 단계별 합산 방식에서 일치한다', () => {
  // 각 구간 경계에서 단계별로 직접 합산한 값과 비교
  eq(applyRate(1 * 억).tax, 1000 * 만, '과세표준 1억');
  eq(applyRate(5 * 억).tax, 9000 * 만, '과세표준 5억');
  eq(applyRate(10 * 억).tax, 2.4 * 억, '과세표준 10억');
  eq(applyRate(30 * 억).tax, 10.4 * 억, '과세표준 30억');
  eq(applyRate(50 * 억).tax, 20.4 * 억, '과세표준 50억');
});

test('과세표준이 0 이하이면 산출세액도 0이다', () => {
  eq(applyRate(0).tax, 0);
  eq(applyRate(-1 * 억).tax, 0);
});

test('세율 구간 경계 바로 위는 다음 구간 세율을 적용한다', () => {
  const just = applyRate(1 * 억 + 1);
  assert.equal(just.rate, 0.2, '1억원을 1원 넘으면 20% 구간');
});

test('장례비용은 최소 500만원을 인정하고 직접비용은 1천만원까지만 공제한다', () => {
  eq(calcFuneralDeduction({ funeralCost: 0, burialCost: 0 }), 500 * 만, '미입력');
  eq(calcFuneralDeduction({ funeralCost: 300 * 만, burialCost: 0 }), 500 * 만, '300만원 지출');
  eq(calcFuneralDeduction({ funeralCost: 800 * 만, burialCost: 0 }), 800 * 만, '800만원 지출');
  eq(calcFuneralDeduction({ funeralCost: 3000 * 만, burialCost: 0 }), 1000 * 만, '한도 초과');
  eq(
    calcFuneralDeduction({ funeralCost: 3000 * 만, burialCost: 2000 * 만 }),
    1500 * 만,
    '봉안시설 포함 최대',
  );
});

test('금융재산 상속공제는 구간별 규칙을 따른다', () => {
  eq(calcFinancialDeduction({ financialAssets: 1500 * 만 }).amount, 1500 * 만, '2천만원 이하 전액');
  eq(calcFinancialDeduction({ financialAssets: 5000 * 만 }).amount, 2000 * 만, '20%가 2천만원 미만');
  eq(calcFinancialDeduction({ financialAssets: 3 * 억 }).amount, 6000 * 만, '20% 적용');
  eq(calcFinancialDeduction({ financialAssets: 15 * 억 }).amount, 2 * 억, '2억원 한도');
  eq(
    calcFinancialDeduction({ financialAssets: 3 * 억, financialDebts: 3 * 억 }).amount,
    0,
    '순금융재산 0',
  );
});

test('배우자 법정상속분은 배우자 1.5 : 자녀 각 1 비율이다', () => {
  assert.ok(Math.abs(calcSpouseLegalShare(0) - 1) < 1e-9, '자녀 없음');
  assert.ok(Math.abs(calcSpouseLegalShare(1) - 1.5 / 2.5) < 1e-9, '자녀 1명');
  assert.ok(Math.abs(calcSpouseLegalShare(2) - 1.5 / 3.5) < 1e-9, '자녀 2명');
  assert.ok(Math.abs(calcSpouseLegalShare(3) - 1.5 / 4.5) < 1e-9, '자녀 3명');
});

test('미성년자공제 연수는 19세까지 남은 햇수다', () => {
  assert.equal(calcMinorYears(0), 19, '갓 태어난 자녀');
  assert.equal(calcMinorYears(10), 9);
  assert.equal(calcMinorYears(18), 1, '한 살만 남아도 1년');
  assert.equal(calcMinorYears(19), 0, '19세는 대상 아님');
  assert.equal(calcMinorYears(25), 0, '성인은 0년');
});

test('미성년자 나이에 소수점이 있으면 내림해서 계산한다', () => {
  // 만 10세 8개월이면 만 10세로 보아 9년
  assert.equal(calcMinorYears(10.8), 9);
});

test('미성년자 나이가 잘못되면 null을 돌려준다', () => {
  assert.equal(calcMinorYears(-1), null);
  assert.equal(calcMinorYears('abc'), null);
});

test('미성년자공제는 자녀공제와 별도로 더해진다', () => {
  const p = calcPersonalDeduction({ childrenCount: 1, minorYears: calcMinorYears(10) });
  eq(p.child, 5000 * 만, '자녀공제 1명');
  eq(p.minor, 9000 * 만, '미성년자공제 9년');
  eq(p.total, 1.4 * 억, '두 공제가 함께 적용');
});

test('그 밖의 인적공제를 항목별로 합산한다', () => {
  const p = calcPersonalDeduction({
    childrenCount: 2,
    minorYears: 10,
    elderlyCount: 1,
    disabledYears: 30,
  });
  eq(p.child, 1 * 억, '자녀 2명');
  eq(p.minor, 1 * 억, '미성년 잔여 10년');
  eq(p.elderly, 5000 * 만, '연로자 1명');
  eq(p.disabled, 3 * 억, '장애인 기대여명 30년');
  eq(p.total, 5.5 * 억, '인적공제 합계');
});

test('배우자와 자녀 2명, 총재산 10억이면 상속세가 발생하지 않는다', () => {
  const r = calculate({
    realEstate: 10 * 억,
    hasSpouse: true,
    childrenCount: 2,
  });
  eq(r.taxableEstate, 10 * 억 - 500 * 만, '과세가액 = 재산 - 장례비');
  assert.equal(r.deductions.basicRouteName, 'lumpSum', '일괄공제 5억 적용');
  // 일괄공제 5억 + 배우자 최소 5억 = 10억 이상이므로 과세표준 0
  eq(r.taxBase, 0, '과세표준');
  eq(r.payableTax, 0, '납부세액');
});

test('배우자 없이 자녀 2명, 총재산 10억이면 일괄공제 5억만 적용된다', () => {
  const r = calculate({
    realEstate: 10 * 억,
    childrenCount: 2,
  });
  const 과세가액 = 10 * 억 - 500 * 만;
  eq(r.taxableEstate, 과세가액);
  eq(r.deductions.total, 5 * 억, '일괄공제만');
  eq(r.taxBase, 과세가액 - 5 * 억, '과세표준 4.95억');

  const 산출 = (과세가액 - 5 * 억) * 0.2 - 1000 * 만;
  eq(r.calculatedTax, 산출, '산출세액');
  eq(r.payableTax, 산출 * 0.97, '신고세액공제 3% 반영');
});

test('배우자와 자녀 2명, 총재산 30억이면 법정상속분 기준 배우자공제가 적용된다', () => {
  const r = calculate({
    realEstate: 30 * 억,
    hasSpouse: true,
    childrenCount: 2,
  });
  const 과세가액 = 30 * 억 - 500 * 만;
  // 배우자 한도의 기준액에서는 장례비용을 빼지 않으므로 30억원이 그대로 기준이 됩니다.
  const 배우자공제 = 30 * 억 * (1.5 / 3.5);

  eq(r.deductions.spouse.amount, 배우자공제, '배우자 상속공제');
  eq(r.deductions.total, 5 * 억 + 배우자공제, '공제 합계');

  const 과세표준 = 과세가액 - 5 * 억 - 배우자공제;
  eq(r.taxBase, 과세표준);
  eq(r.calculatedTax, 과세표준 * 0.4 - 1.6 * 억, '40% 구간');
  eq(r.payableTax, (과세표준 * 0.4 - 1.6 * 억) * 0.97);
});

test('배우자 상속공제는 30억원을 넘지 못한다', () => {
  const r = calculate({
    realEstate: 200 * 억,
    hasSpouse: true,
    childrenCount: 1, // 법정상속분 60% → 120억이지만 30억 한도
  });
  eq(r.deductions.spouse.amount, 30 * 억, '배우자공제 상한');
});

test('배우자가 실제로 적게 상속받아도 최소 5억원은 공제한다', () => {
  const r = calculate({
    realEstate: 20 * 억,
    hasSpouse: true,
    childrenCount: 2,
    spouseActualInherit: 0,
  });
  eq(r.deductions.spouse.amount, 5 * 억, '최소 5억원 보장');
  assert.equal(r.deductions.spouse.applied, 'minimum');
});

test('배우자 단독상속이면 일괄공제를 쓸 수 없고 기초공제만 적용된다', () => {
  const r = calculate({
    realEstate: 20 * 억,
    hasSpouse: true,
    childrenCount: 0,
  });
  assert.equal(r.deductions.lumpSumAvailable, false, '일괄공제 불가');
  eq(r.deductions.basicTotal, 2 * 억, '기초공제 2억만');
});

test('상속공제 합계는 과세가액을 넘을 수 없다', () => {
  const r = calculate({
    realEstate: 3 * 억,
    hasSpouse: true,
    childrenCount: 2,
  });
  assert.equal(r.deductions.capped, true, '공제 한도 적용됨');
  eq(r.deductions.total, r.taxableEstate, '공제는 과세가액까지만');
  eq(r.taxBase, 0);
  eq(r.payableTax, 0);
});

test('사전증여재산은 과세가액에 가산하고 납부한 증여세는 세액공제한다', () => {
  const 기본 = calculate({ realEstate: 15 * 억, childrenCount: 2 });
  const 증여포함 = calculate({
    realEstate: 15 * 억,
    childrenCount: 2,
    priorGifts: 5 * 억,
    priorGiftTaxBase: 4.5 * 억,
    priorGiftTaxPaid: 8000 * 만,
  });

  eq(증여포함.taxableEstate, 기본.taxableEstate + 5 * 억, '사전증여 가산');
  eq(증여포함.giftTaxCredit, 8000 * 만, '증여세액공제');
  assert.ok(증여포함.payableTax > 기본.payableTax, '사전증여로 세부담 증가');
});

test('공제 한도 계산 시 사전증여재산 과세표준을 차감한다', () => {
  const r = calculate({
    realEstate: 2 * 억,
    childrenCount: 1,
    priorGifts: 5 * 억,
    priorGiftTaxBase: 5 * 억,
  });
  // 과세가액 = 2억 - 500만 + 5억, 공제한도 = 과세가액 - 5억(사전증여 과세표준)
  eq(r.deductions.limit, r.taxableEstate - 5 * 억, '공제 한도');
  eq(r.deductions.total, r.deductions.limit, '한도까지만 공제');
});

test('상속인이 아닌 사람에게 유증하면 공제 적용 한도가 줄어든다', () => {
  const 기본 = calculate({ realEstate: 12 * 억, childrenCount: 2 });
  const 유증 = calculate({ realEstate: 12 * 억, childrenCount: 2, bequestToNonHeir: 9 * 억 });

  eq(유증.taxableEstate, 기본.taxableEstate, '과세가액 자체는 같다');
  eq(유증.deductions.limit, 기본.taxableEstate - 9 * 억, '한도에서 유증분을 뺀다');
  eq(유증.deductions.total, 유증.deductions.limit, '한도까지만 공제');
  assert.equal(유증.deductions.capped, true);
  assert.ok(유증.payableTax > 기본.payableTax, '공제가 줄어 세부담이 커진다');
});

test('상속포기로 넘어간 재산도 공제 적용 한도에서 뺀다', () => {
  const r = calculate({
    realEstate: 12 * 억,
    childrenCount: 2,
    renouncedInheritance: 8 * 억,
  });
  eq(r.deductions.limitDeductions.renouncedInheritance, 8 * 억);
  eq(r.deductions.limit, r.taxableEstate - 8 * 억);
});

test('공제 적용 한도에서 빼는 항목들이 함께 반영된다', () => {
  const r = calculate({
    realEstate: 20 * 억,
    childrenCount: 2,
    bequestToNonHeir: 3 * 억,
    renouncedInheritance: 2 * 억,
    priorGifts: 4 * 억,
    priorGiftTaxBase: 3.5 * 억,
  });
  const ld = r.deductions.limitDeductions;
  eq(ld.bequestToNonHeir, 3 * 억);
  eq(ld.renouncedInheritance, 2 * 억);
  eq(ld.priorGiftTaxBase, 3.5 * 억);
  eq(r.deductions.limit, r.taxableEstate - 3 * 억 - 2 * 억 - 3.5 * 억, '세 항목을 모두 차감');
});

test('배우자 법정상속분 한도는 사전증여재산을 포함한 금액으로 계산한다', () => {
  const 증여없음 = calculate({ realEstate: 20 * 억, hasSpouse: true, childrenCount: 2 });
  const 증여있음 = calculate({
    realEstate: 20 * 억,
    hasSpouse: true,
    childrenCount: 2,
    priorGifts: 7 * 억,
  });

  const share = 1.5 / 3.5;
  eq(증여없음.deductions.spouse.legalShareLimit, 20 * 억 * share);
  eq(증여있음.deductions.spouse.legalShareLimit, (20 * 억 + 7 * 억) * share);
  assert.ok(
    증여있음.deductions.spouse.amount > 증여없음.deductions.spouse.amount,
    '사전증여가 더해진 만큼 배우자 공제 한도도 커진다',
  );
});

test('배우자 법정상속분 한도에서 상속인이 아닌 자에 대한 유증을 뺀다', () => {
  const r = calculate({
    realEstate: 30 * 억,
    hasSpouse: true,
    childrenCount: 2,
    bequestToNonHeir: 10 * 억,
  });
  const share = 1.5 / 3.5;
  eq(
    r.deductions.spouse.legalShareLimit,
    (30 * 억 - 10 * 억) * share,
    '유증분을 뺀 금액 기준',
  );
});

test('배우자 사전증여 과세표준은 법정상속분 한도에서 차감된다', () => {
  const r = calculate({
    realEstate: 20 * 억,
    hasSpouse: true,
    childrenCount: 2,
    spousePriorGiftTaxBase: 2 * 억,
  });
  const share = 1.5 / 3.5;
  eq(r.deductions.spouse.legalShareLimit, 20 * 억 * share - 2 * 억);
});

test('배우자가 실제 상속받는 금액을 입력하면 그 금액이 공제 기준이 된다', () => {
  const r = calculate({
    realEstate: 30 * 억,
    hasSpouse: true,
    childrenCount: 2,
    spouseActualInherit: 8 * 억,
  });
  eq(r.deductions.spouse.amount, 8 * 억, '법정상속분 한도(약 12.8억)보다 작으므로 실제 상속액');
  assert.equal(r.deductions.spouse.applied, 'calculated');
});

test('배우자가 법정상속분보다 많이 받아도 한도까지만 공제된다', () => {
  const r = calculate({
    realEstate: 30 * 억,
    hasSpouse: true,
    childrenCount: 2,
    spouseActualInherit: 25 * 억,
  });
  const share = 1.5 / 3.5;
  eq(r.deductions.spouse.amount, 30 * 억 * share, '법정상속분 한도로 제한');
});

test('배우자 법정상속분 한도의 기준액에서 채무와 공과금은 뺀다', () => {
  // 상증법 시행령 제17조 제1항: 자산총액에서 비과세재산과 공과금·채무를 뺀다
  const r = calculate({
    realEstate: 20 * 억,
    hasSpouse: true,
    childrenCount: 2,
    debts: 5 * 억,
    publicCharges: 1000 * 만,
    nonTaxable: 2000 * 만,
  });
  const share = 1.5 / 3.5;
  eq(
    r.deductions.spouse.legalShareLimit,
    (20 * 억 - 2000 * 만 - 1000 * 만 - 5 * 억) * share,
    '비과세·공과금·채무를 뺀 금액 기준',
  );
});

test('배우자 법정상속분 한도의 기준액에서 장례비용은 빼지 않는다', () => {
  // 법 제14조는 공과금·장례비용·채무를 함께 규정하지만
  // 시행령 제17조는 공과금과 채무만 차감하도록 정하고 있습니다.
  const r = calculate({
    realEstate: 20 * 억,
    hasSpouse: true,
    childrenCount: 2,
    funeralCost: 1000 * 만,
    burialCost: 500 * 만,
  });
  const share = 1.5 / 3.5;

  eq(r.funeralDeduction, 1500 * 만, '장례비용 공제는 최대치');
  eq(r.taxableEstate, 20 * 억 - 1500 * 만, '과세가액에서는 장례비용을 뺀다');
  eq(r.deductions.spouse.legalShareLimit, 20 * 억 * share, '한도 기준액에서는 빼지 않는다');
});

test('금융재산 공제와 동거주택 공제가 함께 반영된다', () => {
  const r = calculate({
    realEstate: 12 * 억,
    financialAssets: 3 * 억,
    childrenCount: 1,
    cohabitHouseValue: 8 * 억, // 6억 한도
  });
  eq(r.deductions.financial.amount, 6000 * 만, '순금융재산 3억의 20%');
  eq(r.deductions.cohabitHouse, 6 * 억, '동거주택 6억 한도');
  eq(r.deductions.total, 5 * 억 + 6000 * 만 + 6 * 억, '공제 합계');
});

test('채무와 공과금은 과세가액에서 차감된다', () => {
  const r = calculate({
    realEstate: 20 * 억,
    debts: 5 * 억,
    publicCharges: 1000 * 만,
    childrenCount: 2,
  });
  eq(r.taxableEstate, 20 * 억 - 5 * 억 - 1000 * 만 - 500 * 만, '과세가액');
});

test('세대생략 상속은 산출세액에 30%를 할증한다', () => {
  const 일반 = calculate({ realEstate: 20 * 억, childrenCount: 1 });
  const 세대생략 = calculate({
    realEstate: 20 * 억,
    childrenCount: 1,
    generationSkipRatio: 1,
  });
  eq(세대생략.generationSkipSurcharge, 일반.calculatedTax * 0.3, '30% 할증');
  eq(세대생략.calculatedTax, 일반.calculatedTax, '산출세액 자체는 동일');
});

test('세대생략 상속인이 미성년자이고 20억원을 초과하면 40%를 할증한다', () => {
  const r = calculate({
    realEstate: 50 * 억,
    childrenCount: 1,
    generationSkipRatio: 1,
    generationSkipIsMinor: true,
  });
  eq(r.generationSkipSurcharge, r.calculatedTax * 0.4, '40% 할증');
});

test('신고세액공제 3%는 할증과 증여세액공제 이후 금액에 적용된다', () => {
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const 공제대상 = r.calculatedTax + r.generationSkipSurcharge - r.giftTaxCredit;
  eq(r.reportCredit, 공제대상 * 0.03);
  eq(r.payableTax, 공제대상 * 0.97);
});

test('입력이 비어 있어도 계산이 실패하지 않는다', () => {
  const r = calculate({});
  eq(r.grossEstate, 0);
  eq(r.payableTax, 0);
  assert.ok(Number.isFinite(r.effectiveRate), '실효세율이 유한값');
});

test('음수나 잘못된 입력은 0으로 처리한다', () => {
  const r = calculate({ realEstate: -5 * 억, financialAssets: 'abc', childrenCount: 2 });
  eq(r.grossEstate, 0, '음수·문자열은 0으로');
  eq(r.payableTax, 0);
});

test('과세 여력(headroom)은 공제가 남은 만큼만 표시된다', () => {
  const 여유 = calculate({ realEstate: 3 * 억, childrenCount: 2 });
  assert.ok(여유.headroom > 0, '공제 여력 남음');

  const 과세 = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  eq(과세.headroom, 0, '이미 과세 구간');
});

test('실효세율은 총상속재산가액 대비 납부세액 비율이다', () => {
  const r = calculate({ realEstate: 30 * 억, childrenCount: 2 });
  assert.ok(Math.abs(r.effectiveRate - r.payableTax / r.grossEstate) < 1e-12);
  assert.ok(r.effectiveRate > 0 && r.effectiveRate < 0.5, '실효세율 범위');
});

test('세율표가 누진공제 방식과 구간별 계산 방식에서 서로 모순되지 않는다', () => {
  // 각 구간의 누진공제액이 이전 구간과 연속인지 검증
  let prevLimit = 0;
  let cumulative = 0;
  for (const b of TAX_RULES.brackets) {
    if (b.limit === Infinity) break;
    cumulative += (b.limit - prevLimit) * b.rate;
    eq(applyRate(b.limit).tax, cumulative, `구간 상한 ${b.limit / 억}억`);
    prevLimit = b.limit;
  }
});
