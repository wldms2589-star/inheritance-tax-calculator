/**
 * 상속세 계산에 사용되는 법령 수치 모음 (현행 「상속세 및 증여세법」 기준)
 *
 * 세법이 개정되면 이 파일의 숫자만 고치면 계산기 전체에 반영됩니다.
 * 금액 단위는 모두 "원"입니다.
 */

const 억 = 100000000;
const 만 = 10000;

export const TAX_RULES = {
  /** 표시용 기준 라벨. 화면 하단 고지문구에 노출됩니다. */
  label: '현행 「상속세 및 증여세법」 기준',

  /**
   * 상속세 세율 (상증법 제26조)
   * limit: 과세표준 상한(원), rate: 세율, progressive: 누진공제액(원)
   */
  brackets: [
    { limit: 1 * 억, rate: 0.1, progressive: 0 },
    { limit: 5 * 억, rate: 0.2, progressive: 1000 * 만 },
    { limit: 10 * 억, rate: 0.3, progressive: 6000 * 만 },
    { limit: 30 * 억, rate: 0.4, progressive: 1.6 * 억 },
    { limit: Infinity, rate: 0.5, progressive: 4.6 * 억 },
  ],

  /** 기초공제 (상증법 제18조) */
  basicDeduction: 2 * 억,

  /** 일괄공제 (상증법 제21조) — 기초공제 + 그 밖의 인적공제 합계와 비교해 큰 금액 선택 */
  lumpSumDeduction: 5 * 억,

  /** 그 밖의 인적공제 (상증법 제20조) */
  personal: {
    /** 자녀공제: 1인당 */
    perChild: 5000 * 만,
    /** 미성년자공제: 19세까지 남은 1년당 */
    perMinorYear: 1000 * 만,
    /** 미성년 기준 연령 */
    minorAge: 19,
    /** 연로자공제: 65세 이상 동거가족 1인당 */
    perElderly: 5000 * 만,
    /** 연로자 기준 연령 */
    elderlyAge: 65,
    /** 장애인공제: 기대여명 1년당 */
    perDisabledYear: 1000 * 만,
  },

  /** 배우자 상속공제 (상증법 제19조) */
  spouse: {
    /** 실제 상속받은 금액이 적어도 최소한 이 금액은 공제 */
    minimum: 5 * 억,
    /** 공제 상한 */
    maximum: 30 * 억,
    /** 법정상속분 계산용 배우자 가산비율 (배우자 1.5 : 자녀 각 1) */
    spouseShareWeight: 1.5,
    childShareWeight: 1,
  },

  /** 금융재산 상속공제 (상증법 제22조) */
  financial: {
    /** 순금융재산이 이 금액 이하면 전액 공제 */
    fullDeductionUnder: 2000 * 만,
    /** 위 구간을 넘으면 최소한 보장되는 공제액 */
    floor: 2000 * 만,
    /** 순금융재산에 곱하는 공제율 */
    rate: 0.2,
    /** 공제 상한 */
    maximum: 2 * 억,
  },

  /** 동거주택 상속공제 (상증법 제23조의2) */
  cohabitHouse: {
    maximum: 6 * 억,
    /** 요건: 피상속인과 10년 이상 계속 동거 등 */
    requiredYears: 10,
  },

  /** 장례비용 공제 (상증법 제14조, 시행령 제9조) */
  funeral: {
    /** 장례 직접비용: 실제 지출이 적어도 이 금액은 인정 */
    directMinimum: 500 * 만,
    /** 장례 직접비용 한도 */
    directMaximum: 1000 * 만,
    /** 봉안시설·자연장지 사용료 한도 */
    burialMaximum: 500 * 만,
  },

  /** 신고세액공제 (상증법 제69조) */
  reportCreditRate: 0.03,

  /** 세대생략 할증과세 (상증법 제27조) */
  generationSkip: {
    /** 기본 할증률 */
    rate: 0.3,
    /** 미성년자가 20억원 초과를 상속받는 경우 할증률 */
    minorHighRate: 0.4,
    minorHighThreshold: 20 * 억,
  },

  /** 신고·납부 기한 (상증법 제67조) — 상속개시일이 속하는 달의 말일부터 6개월 */
  filingDeadlineMonths: 6,

  /** 분납 가능 기준 (납부세액이 이 금액 초과) */
  installmentThreshold: 1000 * 만,

  /** 연부연납 가능 기준 (납부세액이 이 금액 초과) */
  annuityThreshold: 2000 * 만,
};

export default TAX_RULES;
