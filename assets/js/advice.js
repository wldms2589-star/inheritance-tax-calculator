/**
 * 상담 유도 안내 엔진
 *
 * 계산 결과와 사용자가 체크한 상황을 함께 보고,
 * "지금 확인해야 할 것"을 우선순위 순으로 골라냅니다.
 * 이 파일도 DOM에 의존하지 않으므로 테스트에서 그대로 검증할 수 있습니다.
 */

const 억 = 100000000;
const 만 = 10000;

/** 상황 체크 문항의 기본값 */
export function createSituation(overrides = {}) {
  return {
    /** 상속받은 부동산을 앞으로 양도할 계획: 'yes' | 'no' | 'unsure' | '' */
    willSellRealEstate: '',
    /** 상속개시일(사망일) YYYY-MM-DD */
    deathDate: '',
    /** 돌아가시기 전 2년 이내에 예금 인출·부동산 처분·대출이 있었는지 */
    hadRecentWithdrawal: false,
    /** 사업체·농지 등 가업·영농 상속 해당 여부 */
    hasBusinessAsset: false,
    /** 비상장주식 보유 여부 */
    hasUnlistedStock: false,
    /** 손자녀 등 세대를 건너뛴 상속 여부 */
    hasGenerationSkip: false,
    /** 상속인 간 협의가 어려운 상황인지 */
    hasDispute: false,
    ...overrides,
  };
}

/** 금액을 "1억 2,345만원" 형태로 */
export function formatKRW(value) {
  const v = Math.round(Number(value) || 0);
  if (v === 0) return '0원';
  const sign = v < 0 ? '-' : '';
  let rest = Math.abs(v);

  const 조 = Math.floor(rest / (10000 * 억));
  rest -= 조 * 10000 * 억;
  const 억단위 = Math.floor(rest / 억);
  rest -= 억단위 * 억;
  const 만단위 = Math.floor(rest / 만);
  const 원단위 = rest - 만단위 * 만;

  const parts = [];
  if (조) parts.push(`${조.toLocaleString()}조`);
  if (억단위) parts.push(`${억단위.toLocaleString()}억`);
  if (만단위) parts.push(`${만단위.toLocaleString()}만`);
  if (원단위) parts.push(`${원단위.toLocaleString()}`);
  return `${sign}${parts.join(' ')}원`;
}

/**
 * 상속세 신고·납부 기한
 * 상속개시일이 속하는 달의 말일부터 6개월이 되는 날입니다.
 */
export function calcFilingDeadline(deathDate, months = 6) {
  if (!deathDate) return null;
  const d = new Date(deathDate);
  if (Number.isNaN(d.getTime())) return null;
  // 사망월의 말일부터 6개월 → 6개월 뒤 달의 말일
  return new Date(d.getFullYear(), d.getMonth() + 1 + months, 0);
}

/** 오늘부터 기한까지 남은 일수 */
export function daysUntil(date, today = new Date()) {
  if (!date) return null;
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((b - a) / 86400000);
}

/**
 * 결과 구간 판정
 * taxable: 세금이 나오는 구간 / borderline: 아슬아슬한 구간 / safe: 여유 있는 구간
 */
export function judge(result) {
  if (result.payableTax > 0) {
    return {
      level: 'taxable',
      badge: '상속세가 발생하는 구간입니다',
      summary: '신고·납부 의무가 있으며, 공제 설계에 따라 세액이 크게 달라질 수 있습니다.',
    };
  }

  // 과세가액이 조금만 늘어도 과세로 바뀌는지 확인
  const threshold = Math.max(2 * 억, result.taxableEstate * 0.2);
  if (result.headroom <= threshold) {
    return {
      level: 'borderline',
      badge: '과세 경계 구간입니다',
      summary: `현재 기준으로는 세금이 없지만, 재산이 ${formatKRW(result.headroom)}만 더 확인되면 과세로 바뀝니다.`,
    };
  }

  return {
    level: 'safe',
    badge: '현재 기준으로는 상속세가 없습니다',
    summary: '다만 신고를 해두는 것이 유리한 경우가 있으니 아래 내용을 확인해 보세요.',
  };
}

/**
 * 안내 카드 생성
 * @param {object} result   calculate()의 반환값
 * @param {object} situation 상황 체크 답변
 * @param {Date}   today
 * @returns {Array<{id,level,title,body,cta}>} 우선순위 순 정렬
 */
export function buildAdvice(result, rawSituation = {}, today = new Date()) {
  const s = createSituation(rawSituation);
  const rules = result.rules;
  const cards = [];
  const push = (card) => cards.push({ cta: false, ...card });

  const taxed = result.payableTax > 0;
  const verdict = judge(result);

  // ── 부동산 양도 계획: 신고 실익의 핵심 논점 ─────────────────
  if (s.willSellRealEstate === 'yes' && result.input.realEstate > 0) {
    if (!taxed) {
      push({
        id: 'sell-no-tax',
        level: 'critical',
        priority: 100,
        title: '상속세는 없지만, 신고를 해두면 양도세를 크게 줄일 수 있습니다',
        body:
          '상속받은 부동산을 나중에 팔 때의 취득가액은 원칙적으로 "상속개시일의 평가액"이 됩니다. ' +
          '신고를 하지 않으면 공시가격 같은 낮은 금액이 취득가액이 되어, 나중에 양도차익이 그만큼 커집니다. ' +
          '지금 감정평가를 받아 시가로 신고해 두면 상속세는 여전히 0원이면서 취득가액만 높일 수 있어, ' +
          '양도소득세에서 수천만 원 단위의 차이가 나는 경우가 많습니다.',
        cta: true,
      });
    } else {
      push({
        id: 'sell-taxed',
        level: 'critical',
        priority: 95,
        title: '상속세와 양도소득세를 함께 놓고 계산해야 합니다',
        body:
          '감정평가로 신고가액을 올리면 취득가액이 높아져 양도세는 줄지만 상속세는 늘어납니다. ' +
          '두 세금의 합계가 가장 작아지는 지점을 찾는 것이 실제 절세의 핵심이며, ' +
          '재산 구성과 양도 시점에 따라 유리한 방향이 달라집니다.',
        cta: true,
      });
    }
  } else if (s.willSellRealEstate === 'unsure' && result.input.realEstate > 0) {
    push({
      id: 'sell-unsure',
      level: 'warning',
      priority: 70,
      title: '부동산을 파실 가능성이 조금이라도 있다면 지금 판단해야 합니다',
      body:
        '감정평가를 통한 취득가액 상향은 상속세 신고기한이 지나면 되돌릴 수 없습니다. ' +
        '나중에 팔 계획이 생겼을 때는 이미 선택지가 사라진 뒤인 경우가 많습니다.',
      cta: true,
    });
  }

  // ── 신고·납부 기한 ────────────────────────────────────────
  const deadline = calcFilingDeadline(s.deathDate, rules.filingDeadlineMonths);
  if (deadline) {
    const left = daysUntil(deadline, today);
    const dateText = `${deadline.getFullYear()}년 ${deadline.getMonth() + 1}월 ${deadline.getDate()}일`;
    if (left < 0) {
      push({
        id: 'deadline-passed',
        level: 'critical',
        priority: 99,
        title: `신고기한(${dateText})이 이미 지났습니다`,
        body:
          '기한을 넘기면 무신고가산세(납부세액의 20%)와 납부지연가산세가 더해집니다. ' +
          '다만 기한 후 신고를 하면 가산세를 감면받을 수 있으므로, 늦었더라도 빨리 정리하는 편이 유리합니다.',
        cta: true,
      });
    } else if (left <= 60) {
      push({
        id: 'deadline-soon',
        level: 'critical',
        priority: 98,
        title: `신고기한까지 ${left}일 남았습니다 (${dateText})`,
        body:
          '감정평가는 의뢰부터 결과까지 통상 2~3주가 걸리고, 은행·등기 자료 수집에도 시간이 필요합니다. ' +
          '지금 시작하지 않으면 선택할 수 있는 방법이 줄어듭니다.',
        cta: true,
      });
    } else {
      push({
        id: 'deadline-info',
        level: 'info',
        priority: 40,
        title: `신고·납부 기한은 ${dateText}입니다 (${left}일 남음)`,
        body: '상속개시일이 속하는 달의 말일부터 6개월 이내에 신고·납부해야 합니다.',
      });
    }
  }

  // ── 경계 구간 ────────────────────────────────────────────
  if (verdict.level === 'borderline') {
    push({
      id: 'borderline',
      level: 'warning',
      priority: 90,
      title: '지금은 세금이 없지만 안심하기 이른 구간입니다',
      body:
        `공제 여력이 ${formatKRW(result.headroom)} 남아 있습니다. ` +
        '누락된 보험금·퇴직금, 사망 전 인출한 예금, 10년 이내 증여가 확인되면 그만큼 과세가액이 늘어나 ' +
        '과세 구간으로 넘어갈 수 있습니다.',
      cta: true,
    });
  }

  // ── 세율 구간 경계 ───────────────────────────────────────
  if (result.taxBase > 0) {
    const bracket = rules.brackets.find((b) => result.taxBase <= b.limit);
    if (bracket && bracket.limit !== Infinity) {
      const gap = bracket.limit - result.taxBase;
      if (gap <= bracket.limit * 0.15) {
        push({
          id: 'bracket-edge',
          level: 'warning',
          priority: 75,
          title: `세율 구간 경계에 ${formatKRW(gap)} 차이로 걸쳐 있습니다`,
          body:
            `현재 과세표준은 ${formatKRW(result.taxBase)}로 ${Math.round(bracket.rate * 100)}% 구간입니다. ` +
            '공제 항목을 하나만 더 챙겨도 아래 구간으로 내려가 세율 자체가 달라질 수 있습니다.',
          cta: true,
        });
      }
    }
  }

  // ── 배우자 상속공제 설계 ──────────────────────────────────
  if (result.input.hasSpouse && taxed) {
    push({
      id: 'spouse-planning',
      level: 'warning',
      priority: 85,
      title: '배우자가 얼마를 상속받느냐에 따라 세액이 달라집니다',
      body:
        `현재 배우자 상속공제는 ${formatKRW(result.deductions.spouse.amount)}로 계산되었습니다. ` +
        '배우자 상속공제는 실제로 배우자가 상속받은 금액을 기준으로 최대 30억원까지 받을 수 있어, ' +
        '재산 분할 방식만 바꿔도 세액이 크게 줄어드는 경우가 있습니다.',
      cta: true,
    });
  }

  if (result.input.hasSpouse && !result.deductions.lumpSumAvailable) {
    push({
      id: 'spouse-only',
      level: 'warning',
      priority: 80,
      title: '배우자 단독상속은 일괄공제 5억원을 쓸 수 없습니다',
      body:
        '자녀 등 다른 상속인 없이 배우자만 상속받는 경우에는 일괄공제 대신 ' +
        '기초공제 2억원과 그 밖의 인적공제만 적용됩니다. 상속인 구성을 다시 확인해 보세요.',
      cta: true,
    });
  }

  // ── 사망 전 인출·처분 (추정상속재산) ───────────────────────
  if (s.hadRecentWithdrawal) {
    push({
      id: 'presumed',
      level: 'critical',
      priority: 88,
      title: '돌아가시기 전 인출·처분 내역은 세무서가 반드시 확인합니다',
      body:
        '사망 전 1년 이내 2억원, 2년 이내 5억원 이상의 예금 인출·재산 처분·채무 부담이 있으면, ' +
        '사용처를 소명하지 못한 금액은 상속받은 것으로 추정되어 과세가액에 더해집니다. ' +
        '계산기에 반영하지 않으셨다면 실제 세액은 더 커질 수 있습니다.',
      cta: true,
    });
  }

  // ── 사전증여 ────────────────────────────────────────────
  if (result.priorGifts > 0) {
    push({
      id: 'prior-gift',
      level: 'info',
      priority: 60,
      title: '10년 이내 증여재산은 상속재산에 합산됩니다',
      body:
        '상속인에게 증여한 재산은 10년, 상속인이 아닌 사람에게 증여한 재산은 5년 이내 분이 합산됩니다. ' +
        '이미 낸 증여세는 세액공제로 빼주지만, 합산으로 세율 구간이 올라가면 추가 부담이 생깁니다.',
    });
  }

  // ── 가업·영농 상속 ──────────────────────────────────────
  if (s.hasBusinessAsset) {
    push({
      id: 'business',
      level: 'critical',
      priority: 87,
      title: '가업상속공제·영농상속공제는 이 계산기에 반영되지 않았습니다',
      body:
        '가업상속공제와 영농상속공제는 피상속인의 경영기간, 상속인의 종사요건, 상속 후 사후관리 등 ' +
        '요건이 까다롭고 개별 사정에 따라 적용 여부가 달라집니다. ' +
        '해당된다면 실제 세액은 여기 표시된 금액과 다를 수 있으므로 별도로 확인이 필요합니다.',
      cta: true,
    });
  }

  // ── 비상장주식 ──────────────────────────────────────────
  if (s.hasUnlistedStock) {
    push({
      id: 'unlisted',
      level: 'warning',
      priority: 72,
      title: '비상장주식은 평가 방법에 따라 금액이 크게 달라집니다',
      body:
        '비상장주식은 순손익가치와 순자산가치를 가중평균해 평가하며, 회사의 부동산 비중에 따라 평가방식이 바뀝니다. ' +
        '직접 계산한 금액과 세무서가 인정하는 금액의 차이가 가장 크게 벌어지는 항목입니다.',
      cta: true,
    });
  }

  // ── 세대생략 ────────────────────────────────────────────
  if (s.hasGenerationSkip) {
    push({
      id: 'generation-skip',
      level: 'warning',
      priority: 74,
      title: '손자녀에게 바로 상속하면 세액이 30% 할증됩니다',
      body:
        '세대를 건너뛴 상속에는 산출세액의 30%(미성년자가 20억원 초과 상속 시 40%)가 더해집니다. ' +
        '다만 자녀가 이미 사망해 손자녀가 대습상속하는 경우에는 할증되지 않습니다.',
      cta: true,
    });
  }

  // ── 납부 방법 ───────────────────────────────────────────
  if (result.payableTax > rules.annuityThreshold) {
    const 금융재산 = result.input.financialAssets;
    const 납부재원부족 = 금융재산 < result.payableTax;
    push({
      id: 'annuity',
      level: 납부재원부족 ? 'critical' : 'info',
      priority: 납부재원부족 ? 86 : 50,
      title: 납부재원부족
        ? '세금을 낼 현금이 부족할 수 있습니다'
        : '연부연납으로 나누어 낼 수 있습니다',
      body: 납부재원부족
        ? `납부세액은 ${formatKRW(result.payableTax)}인데 상속재산 중 금융재산은 ${formatKRW(금융재산)}입니다. ` +
          '부동산을 급하게 팔면 제값을 못 받는 경우가 많으므로, 연부연납(최장 10년 분할납부)이나 ' +
          '물납을 미리 검토해야 합니다. 연부연납은 신고기한 내에 신청해야만 가능합니다.'
        : '납부세액이 2천만원을 넘으면 담보를 제공하고 최장 10년에 걸쳐 나누어 낼 수 있습니다. ' +
          '신고기한 내에 신청해야 하며, 기한을 놓치면 일시납해야 합니다.',
      cta: 납부재원부족,
    });
  } else if (result.payableTax > rules.installmentThreshold) {
    push({
      id: 'installment',
      level: 'info',
      priority: 45,
      title: '2개월 내 분납이 가능합니다',
      body: '납부세액이 1천만원을 넘으면 일부를 신고기한 다음 날부터 2개월 이내에 나누어 낼 수 있습니다.',
    });
  }

  // ── 놓치기 쉬운 공제 ────────────────────────────────────
  const fin = result.deductions.financial;
  if (fin.amount === 0 && result.input.financialAssets === 0 && result.grossEstate > 0) {
    push({
      id: 'financial-missing',
      level: 'info',
      priority: 55,
      title: '금융재산을 입력하지 않으셨습니다',
      body:
        '예금·주식·보험금 등 금융재산이 있으면 최대 2억원까지 추가 공제를 받을 수 있습니다. ' +
        '금융감독원 "상속인 금융거래 조회 서비스"로 몰랐던 계좌를 한 번에 확인할 수 있습니다.',
    });
  }

  if (result.deductions.cohabitHouse === 0 && result.input.realEstate > 0) {
    push({
      id: 'cohabit-house',
      level: 'info',
      priority: 52,
      title: '10년 이상 함께 산 집이 있다면 최대 6억원을 더 공제받을 수 있습니다',
      body:
        '피상속인과 10년 이상 계속 한집에 살았고, 상속인이 무주택이거나 함께 살던 그 집만 보유한 경우 ' +
        '동거주택 상속공제를 받을 수 있습니다. 요건이 까다로워 놓치기 쉬운 공제입니다.',
    });
  }

  // ── 상속인 간 분쟁 ──────────────────────────────────────
  if (s.hasDispute) {
    push({
      id: 'dispute',
      level: 'warning',
      priority: 73,
      title: '분할 협의가 늦어지면 배우자 상속공제를 못 받을 수 있습니다',
      body:
        '배우자 상속공제를 받으려면 원칙적으로 신고기한 다음 날부터 9개월 이내에 ' +
        '배우자 몫으로 재산을 분할하고 등기까지 마쳐야 합니다. 협의가 길어지면 공제가 줄어듭니다.',
      cta: true,
    });
  }

  // ── 여유 있는 구간이면 마무리 안내 ────────────────────────
  if (verdict.level === 'safe' && cards.filter((c) => c.cta).length === 0) {
    push({
      id: 'safe-summary',
      level: 'good',
      priority: 10,
      title: '지금 구조로는 상속세 부담이 없습니다',
      body:
        `공제 여력이 ${formatKRW(result.headroom)} 남아 있습니다. ` +
        '다만 부동산을 나중에 팔 계획이 있거나, 확인하지 못한 재산이 있다면 결과가 달라질 수 있습니다.',
    });
  }

  return cards.sort((a, b) => b.priority - a.priority);
}

export default buildAdvice;
