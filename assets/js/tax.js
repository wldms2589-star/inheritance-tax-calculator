/**
 * 상속세 계산 엔진 (순수 함수)
 *
 * DOM에 의존하지 않으므로 브라우저와 Node(테스트) 양쪽에서 그대로 사용합니다.
 * 입력·출력 금액 단위는 모두 "원"입니다.
 */

import { TAX_RULES } from './tax-rules.js';

/** 음수·NaN을 0으로 정리한 숫자 */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** 계산에 필요한 입력값의 기본형 */
export function createInput(overrides = {}) {
  return {
    // 1. 상속재산
    realEstate: 0,        // 부동산
    financialAssets: 0,   // 금융재산 (예금·주식·보험 등)
    otherAssets: 0,       // 기타재산 (차량·회원권·귀금속 등)
    deemedAssets: 0,      // 간주상속재산 (보험금·신탁재산·퇴직금)
    presumedAssets: 0,    // 추정상속재산 (사용처 불분명 인출·처분·채무)

    // 2. 과세가액에서 빼는 항목
    nonTaxable: 0,        // 비과세·과세가액 불산입 (공익법인 출연 등)
    publicCharges: 0,     // 공과금
    funeralCost: 0,       // 장례 직접비용 (미입력 시 법정 최소액 인정)
    burialCost: 0,        // 봉안시설·자연장지 사용료
    debts: 0,             // 채무 (금융채무 포함 전체)
    financialDebts: 0,    // 그중 금융기관 채무 (순금융재산 계산용)

    // 3. 과세가액에 더하는 항목
    priorGifts: 0,             // 사전증여재산 가산액
    priorGiftTaxBase: 0,       // 사전증여재산의 증여세 과세표준
    spousePriorGiftTaxBase: 0, // 그중 배우자 몫 과세표준
    priorGiftTaxPaid: 0,       // 이미 낸 증여세액 (증여세액공제)

    // 4. 상속인 구성
    hasSpouse: false,
    spouseActualInherit: null, // 배우자가 실제 상속받는 금액 (null이면 법정상속분 가정)
    childrenCount: 0,
    minorYears: 0,        // 미성년 자녀들의 19세까지 잔여연수 합계
    elderlyCount: 0,      // 65세 이상 동거가족 수
    disabledYears: 0,     // 장애인 상속인·동거가족의 기대여명 합계

    // 5. 물적 공제
    cohabitHouseValue: 0, // 동거주택 가액 (담보채무 차감 후)
    casualtyLoss: 0,      // 재해손실공제
    appraisalFee: 0,      // 감정평가수수료

    // 6. 기타
    generationSkipRatio: 0, // 세대생략 상속재산의 비율 (0~1)
    generationSkipIsMinor: false,
    foreignTaxCredit: 0,    // 외국납부세액공제
    ...overrides,
  };
}

/** 과세표준에 세율을 적용해 산출세액을 구합니다. */
export function applyRate(taxBase, rules = TAX_RULES) {
  const base = num(taxBase);
  if (base <= 0) return { tax: 0, rate: 0, progressive: 0 };
  const last = rules.brackets[rules.brackets.length - 1];
  const bracket = rules.brackets.find((b) => base <= b.limit) || last;
  return {
    tax: Math.max(0, base * bracket.rate - bracket.progressive),
    rate: bracket.rate,
    progressive: bracket.progressive,
  };
}

/** 장례비용 공제액 (직접비용 최소·최대 한도 + 봉안시설 별도 한도) */
export function calcFuneralDeduction(input, rules = TAX_RULES) {
  const { directMinimum, directMaximum, burialMaximum } = rules.funeral;
  const direct = Math.min(Math.max(num(input.funeralCost), directMinimum), directMaximum);
  const burial = Math.min(num(input.burialCost), burialMaximum);
  return direct + burial;
}

/** 그 밖의 인적공제 (자녀·미성년자·연로자·장애인) */
export function calcPersonalDeduction(input, rules = TAX_RULES) {
  const p = rules.personal;
  const child = num(input.childrenCount) * p.perChild;
  const minor = num(input.minorYears) * p.perMinorYear;
  const elderly = num(input.elderlyCount) * p.perElderly;
  const disabled = num(input.disabledYears) * p.perDisabledYear;
  return { child, minor, elderly, disabled, total: child + minor + elderly + disabled };
}

/** 배우자의 법정상속분 (배우자 1.5 : 자녀 각 1) */
export function calcSpouseLegalShare(childrenCount, rules = TAX_RULES) {
  const { spouseShareWeight, childShareWeight } = rules.spouse;
  const children = num(childrenCount);
  return spouseShareWeight / (spouseShareWeight + children * childShareWeight);
}

/**
 * 배우자 상속공제
 * 실제 상속받은 금액을 기준으로 하되 법정상속분 한도와 30억원 한도를 적용하고,
 * 그 결과가 5억원에 못 미치면 최소 5억원을 공제합니다.
 */
export function calcSpouseDeduction(input, estateForShare, rules = TAX_RULES) {
  if (!input.hasSpouse) {
    return { amount: 0, legalShare: 0, legalShareLimit: 0, actual: 0, applied: 'none' };
  }
  const s = rules.spouse;
  const legalShare = calcSpouseLegalShare(input.childrenCount, rules);

  // 법정상속분 한도 = 상속재산가액 × 배우자 법정상속분 − 배우자 사전증여재산 과세표준
  const legalShareLimit = Math.max(
    0,
    num(estateForShare) * legalShare - num(input.spousePriorGiftTaxBase),
  );

  // 실제 상속받는 금액을 입력하지 않으면 법정상속분만큼 상속받는 것으로 가정합니다.
  const actual =
    input.spouseActualInherit === null || input.spouseActualInherit === undefined
      ? num(estateForShare) * legalShare
      : num(input.spouseActualInherit);

  const capped = Math.min(actual, legalShareLimit, s.maximum);
  const amount = Math.max(capped, s.minimum);

  return {
    amount,
    legalShare,
    legalShareLimit,
    actual,
    applied: capped < s.minimum ? 'minimum' : 'calculated',
  };
}

/** 금융재산 상속공제 */
export function calcFinancialDeduction(input, rules = TAX_RULES) {
  const f = rules.financial;
  const net = num(input.financialAssets) - num(input.financialDebts);
  if (net <= 0) return { net: 0, amount: 0 };
  if (net <= f.fullDeductionUnder) return { net, amount: net };
  return { net, amount: Math.min(Math.max(net * f.rate, f.floor), f.maximum) };
}

/** 동거주택 상속공제 */
export function calcCohabitHouseDeduction(input, rules = TAX_RULES) {
  return Math.min(num(input.cohabitHouseValue), rules.cohabitHouse.maximum);
}

/**
 * 상속세 전체 계산
 * 각 단계별 중간값을 모두 담은 결과 객체를 돌려줍니다.
 */
export function calculate(rawInput, rules = TAX_RULES) {
  const input = createInput(rawInput);

  // 1단계: 총상속재산가액
  const grossEstate =
    num(input.realEstate) +
    num(input.financialAssets) +
    num(input.otherAssets) +
    num(input.deemedAssets) +
    num(input.presumedAssets);

  // 2단계: 과세가액에서 빼는 항목
  const funeralDeduction = calcFuneralDeduction(input, rules);
  const charges = num(input.publicCharges) + funeralDeduction + num(input.debts);
  const nonTaxable = num(input.nonTaxable);

  // 3단계: 상속세 과세가액
  // 소수점 오차가 남으면 세율 구간 경계에서 한 칸 위 구간으로 잘못 넘어가므로 원 단위로 정리합니다.
  const netEstate = Math.round(Math.max(0, grossEstate - nonTaxable - charges)); // 사전증여 가산 전
  const priorGifts = num(input.priorGifts);
  const taxableEstate = Math.round(netEstate + priorGifts);

  // 4단계: 상속공제
  const personal = calcPersonalDeduction(input, rules);
  const basicRoute = rules.basicDeduction + personal.total;

  // 배우자 단독상속(다른 상속인이 없는 경우)은 일괄공제를 적용할 수 없습니다.
  const spouseOnly = input.hasSpouse && num(input.childrenCount) === 0;
  const lumpSumAvailable = !spouseOnly;
  const basicTotal = lumpSumAvailable
    ? Math.max(basicRoute, rules.lumpSumDeduction)
    : basicRoute;
  const basicRouteName =
    lumpSumAvailable && rules.lumpSumDeduction >= basicRoute ? 'lumpSum' : 'basic';

  const spouse = calcSpouseDeduction(input, netEstate, rules);
  const financial = calcFinancialDeduction(input, rules);
  const cohabitHouse = calcCohabitHouseDeduction(input, rules);
  const casualtyLoss = num(input.casualtyLoss);

  const deductionSum =
    basicTotal + spouse.amount + financial.amount + cohabitHouse + casualtyLoss;

  // 공제 적용 한도 (상증법 제24조): 공제 총액은 과세가액에서
  // 사전증여재산의 증여세 과세표준을 뺀 금액을 넘을 수 없습니다.
  const deductionLimit = Math.max(0, taxableEstate - num(input.priorGiftTaxBase));
  const totalDeduction = Math.min(deductionSum, deductionLimit);
  const deductionCapped = deductionSum > deductionLimit;

  // 5단계: 과세표준
  const appraisalFee = num(input.appraisalFee);
  const taxBase = Math.round(Math.max(0, taxableEstate - totalDeduction - appraisalFee));

  // 6단계: 산출세액
  const { tax: calculatedTax, rate, progressive } = applyRate(taxBase, rules);

  // 7단계: 세대생략 할증
  const gs = rules.generationSkip;
  const gsRatio = Math.min(Math.max(num(input.generationSkipRatio), 0), 1);
  const gsRate =
    input.generationSkipIsMinor && taxableEstate * gsRatio > gs.minorHighThreshold
      ? gs.minorHighRate
      : gs.rate;
  const generationSkipSurcharge = calculatedTax * gsRatio * gsRate;

  // 8단계: 세액공제
  const taxBeforeCredit = calculatedTax + generationSkipSurcharge;
  const giftTaxCredit = Math.min(num(input.priorGiftTaxPaid), taxBeforeCredit);
  const foreignTaxCredit = Math.min(
    num(input.foreignTaxCredit),
    Math.max(0, taxBeforeCredit - giftTaxCredit),
  );
  const creditBase = Math.max(0, taxBeforeCredit - giftTaxCredit - foreignTaxCredit);
  const reportCredit = creditBase * rules.reportCreditRate;

  const payableTax = Math.max(0, creditBase - reportCredit);

  return {
    input,
    rules,
    grossEstate,
    nonTaxable,
    funeralDeduction,
    charges,
    netEstate,
    priorGifts,
    taxableEstate,
    deductions: {
      basicRoute,      // 기초공제 + 그 밖의 인적공제
      lumpSum: lumpSumAvailable ? rules.lumpSumDeduction : 0,
      basicTotal,      // 위 둘 중 실제 적용된 금액
      basicRouteName,  // 'lumpSum' 또는 'basic'
      lumpSumAvailable,
      personal,
      spouse,
      financial,
      cohabitHouse,
      casualtyLoss,
      sum: deductionSum,
      limit: deductionLimit,
      total: totalDeduction,
      capped: deductionCapped,
    },
    appraisalFee,
    taxBase,
    rate,
    progressive,
    calculatedTax,
    generationSkipSurcharge,
    giftTaxCredit,
    foreignTaxCredit,
    reportCredit,
    payableTax,
    /** 실효세율 = 납부세액 / 총상속재산가액 */
    effectiveRate: grossEstate > 0 ? payableTax / grossEstate : 0,
    /**
     * 공제 여력: 과세가액이 앞으로 얼마나 더 늘어나야 과세되는지.
     * 한도로 잘리기 전의 공제 합계를 기준으로 하므로 "아직 여유가 얼마" 안내에 쓸 수 있습니다.
     */
    headroom: Math.max(0, deductionSum + appraisalFee - taxableEstate),
  };
}

export { TAX_RULES };
export default calculate;
