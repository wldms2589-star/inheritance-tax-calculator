import test from 'node:test';
import assert from 'node:assert/strict';

import { calculate } from '../assets/js/tax.js';
import {
  buildAdvice,
  judge,
  formatKRW,
  calcFilingDeadline,
  daysUntil,
} from '../assets/js/advice.js';

const 억 = 100000000;
const 만 = 10000;

const ids = (cards) => cards.map((c) => c.id);

test('금액을 한국식 단위로 표기한다', () => {
  assert.equal(formatKRW(0), '0원');
  assert.equal(formatKRW(50000), '5만원');
  assert.equal(formatKRW(1 * 억), '1억원');
  assert.equal(formatKRW(1.2345 * 억), '1억 2,345만원');
  assert.equal(formatKRW(12 * 억 + 3400 * 만), '12억 3,400만원');
  assert.equal(formatKRW(10000 * 억), '1조원');
});

test('신고기한은 상속개시일이 속하는 달의 말일부터 6개월 뒤다', () => {
  const d1 = calcFilingDeadline('2026-03-15');
  assert.equal(d1.getFullYear(), 2026);
  assert.equal(d1.getMonth() + 1, 9);
  assert.equal(d1.getDate(), 30, '3월 사망 → 9월 30일');

  const d2 = calcFilingDeadline('2026-01-01');
  assert.equal(d2.getMonth() + 1, 7);
  assert.equal(d2.getDate(), 31, '1월 사망 → 7월 31일');

  const d3 = calcFilingDeadline('2025-12-25');
  assert.equal(d3.getFullYear(), 2026);
  assert.equal(d3.getMonth() + 1, 6);
  assert.equal(d3.getDate(), 30, '연도를 넘기는 경우');

  assert.equal(calcFilingDeadline(''), null, '날짜 미입력');
  assert.equal(calcFilingDeadline('말도안되는날짜'), null, '잘못된 값');
});

test('남은 일수를 날짜 단위로 계산한다', () => {
  const today = new Date(2026, 8, 7);
  assert.equal(daysUntil(new Date(2026, 8, 7), today), 0);
  assert.equal(daysUntil(new Date(2026, 8, 30), today), 23);
  assert.equal(daysUntil(new Date(2026, 7, 31), today), -7, '지난 기한은 음수');
});

test('세금이 나오면 과세 구간으로 판정한다', () => {
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  assert.equal(judge(r).level, 'taxable');
});

test('공제 여력이 얼마 남지 않으면 경계 구간으로 판정한다', () => {
  // 자녀 2명, 일괄공제 5억. 과세가액 4.5억 → 여력 약 5천만원
  const r = calculate({ realEstate: 4.55 * 억, childrenCount: 2 });
  assert.equal(r.payableTax, 0, '세금은 없음');
  assert.equal(judge(r).level, 'borderline');
});

test('공제 여력이 충분하면 안전 구간으로 판정한다', () => {
  const r = calculate({ realEstate: 1 * 억, childrenCount: 2 });
  assert.equal(judge(r).level, 'safe');
});

test('세금이 없어도 부동산 양도 계획이 있으면 신고 실익을 최우선으로 안내한다', () => {
  const r = calculate({ realEstate: 6 * 억, hasSpouse: true, childrenCount: 2 });
  const cards = buildAdvice(r, { willSellRealEstate: 'yes' });

  assert.equal(r.payableTax, 0, '상속세는 없는 상황');
  assert.equal(cards[0].id, 'sell-no-tax', '가장 위에 노출');
  assert.equal(cards[0].level, 'critical');
  assert.equal(cards[0].cta, true, '상담 연결 대상');
  assert.match(cards[0].body, /취득가액/);
});

test('세금이 나오는 상황에서 부동산 양도 계획이 있으면 두 세금을 함께 보라고 안내한다', () => {
  const r = calculate({ realEstate: 30 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { willSellRealEstate: 'yes' });
  assert.ok(ids(cards).includes('sell-taxed'));
  assert.ok(!ids(cards).includes('sell-no-tax'));
});

test('양도 계획이 미정이면 기한 내 판단이 필요하다고 안내한다', () => {
  const r = calculate({ realEstate: 6 * 억, hasSpouse: true, childrenCount: 2 });
  const cards = buildAdvice(r, { willSellRealEstate: 'unsure' });
  assert.ok(ids(cards).includes('sell-unsure'));
});

test('부동산이 없으면 양도 관련 안내를 하지 않는다', () => {
  const r = calculate({ financialAssets: 6 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { willSellRealEstate: 'yes' });
  assert.ok(!ids(cards).some((id) => id.startsWith('sell-')));
});

test('신고기한이 임박하면 남은 일수를 경고한다', () => {
  const today = new Date(2026, 8, 7); // 2026-09-07
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { deathDate: '2026-03-15' }, today); // 기한 2026-09-30
  const card = cards.find((c) => c.id === 'deadline-soon');
  assert.ok(card, '임박 경고 존재');
  assert.match(card.title, /23일 남았습니다/);
});

test('신고기한이 지났으면 기한 후 신고를 안내한다', () => {
  const today = new Date(2026, 8, 7);
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { deathDate: '2025-06-10' }, today);
  const card = cards.find((c) => c.id === 'deadline-passed');
  assert.ok(card, '기한 경과 안내');
  assert.match(card.body, /가산세/);
});

test('기한이 넉넉하면 정보성 안내로만 표시한다', () => {
  const today = new Date(2026, 8, 7);
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { deathDate: '2026-08-20' }, today);
  const card = cards.find((c) => c.id === 'deadline-info');
  assert.ok(card);
  assert.equal(card.level, 'info');
});

test('경계 구간이면 누락 재산 확인을 권한다', () => {
  const r = calculate({ realEstate: 4.55 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('borderline'));
});

test('세율 구간 경계에 가까우면 경고한다', () => {
  // 자녀 1명(공제 5억), 과세표준이 5억 바로 아래가 되도록 재산 설정
  const r = calculate({ realEstate: 9.8 * 억, childrenCount: 1 });
  assert.equal(r.taxBase, 4.75 * 억, '20% 구간 상단');
  assert.equal(r.rate, 0.2);
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('bracket-edge'));
});

test('배우자가 있고 세금이 나오면 분할 설계를 안내한다', () => {
  const r = calculate({ realEstate: 30 * 억, hasSpouse: true, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  const card = cards.find((c) => c.id === 'spouse-planning');
  assert.ok(card);
  assert.match(card.body, /재산 분할/);
});

test('가업·영농 상속 안내는 공제 금액을 단정하지 않는다', () => {
  const r = calculate({ realEstate: 50 * 억, childrenCount: 2 });
  const card = buildAdvice(r, { hasBusinessAsset: true }).find((c) => c.id === 'business');
  assert.ok(card);
  assert.match(card.title, /반영되지 않았습니다/);
  assert.doesNotMatch(`${card.title}${card.body}`, /억원/, '구체적인 공제 한도를 적지 않는다');
});

test('배우자 단독상속이면 일괄공제를 쓸 수 없다고 알린다', () => {
  const r = calculate({ realEstate: 20 * 억, hasSpouse: true, childrenCount: 0 });
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('spouse-only'));
});

test('사망 전 인출이 있었다면 추정상속재산을 경고한다', () => {
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { hadRecentWithdrawal: true });
  const card = cards.find((c) => c.id === 'presumed');
  assert.ok(card);
  assert.equal(card.level, 'critical');
});

test('가업 자산이 있으면 가업상속공제 미반영 사실을 알린다', () => {
  const r = calculate({ realEstate: 50 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { hasBusinessAsset: true });
  assert.ok(ids(cards).includes('business'));
});

test('비상장주식과 세대생략 상속을 각각 안내한다', () => {
  const r = calculate({ realEstate: 30 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, { hasUnlistedStock: true, hasGenerationSkip: true });
  assert.ok(ids(cards).includes('unlisted'));
  assert.ok(ids(cards).includes('generation-skip'));
});

test('납부세액보다 금융재산이 적으면 납부재원 문제를 우선 경고한다', () => {
  const r = calculate({ realEstate: 50 * 억, financialAssets: 1 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  const card = cards.find((c) => c.id === 'annuity');
  assert.ok(card);
  assert.equal(card.level, 'critical');
  assert.equal(card.cta, true);
  assert.match(card.body, /연부연납/);
});

test('납부재원이 충분하면 연부연납을 정보성으로만 안내한다', () => {
  const r = calculate({ realEstate: 20 * 억, financialAssets: 30 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  const card = cards.find((c) => c.id === 'annuity');
  assert.ok(card);
  assert.equal(card.level, 'info');
});

test('세액이 1천만원대면 분납을 안내한다', () => {
  // 과세표준 1.25억 → 산출세액 1,500만원, 신고세액공제 후 1,455만원
  const r = calculate({ realEstate: 6.3 * 억, childrenCount: 2 });
  assert.ok(r.payableTax > 1000 * 만 && r.payableTax <= 2000 * 만, '분납 구간');
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('installment'));
});

test('금융재산을 입력하지 않으면 조회 서비스를 안내한다', () => {
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('financial-missing'));
});

test('동거주택 공제를 쓰지 않았으면 요건 확인을 권한다', () => {
  const r = calculate({ realEstate: 20 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('cohabit-house'));
});

test('상속인 간 분쟁이 있으면 배우자 공제 기한을 알린다', () => {
  const r = calculate({ realEstate: 20 * 억, hasSpouse: true, childrenCount: 2 });
  const cards = buildAdvice(r, { hasDispute: true });
  assert.ok(ids(cards).includes('dispute'));
});

test('여유 구간이고 특별한 이슈가 없으면 안심 안내만 남는다', () => {
  const r = calculate({ realEstate: 1 * 억, childrenCount: 2 });
  const cards = buildAdvice(r, {});
  assert.ok(ids(cards).includes('safe-summary'));
  assert.equal(cards.filter((c) => c.cta).length, 0, '억지 상담 유도 없음');
});

test('안내 카드는 우선순위가 높은 순으로 정렬된다', () => {
  const r = calculate({ realEstate: 50 * 억, hasSpouse: true, childrenCount: 2 });
  const cards = buildAdvice(r, {
    willSellRealEstate: 'yes',
    deathDate: '2026-03-15',
    hadRecentWithdrawal: true,
    hasBusinessAsset: true,
  }, new Date(2026, 8, 7));

  for (let i = 1; i < cards.length; i += 1) {
    assert.ok(cards[i - 1].priority >= cards[i].priority, '내림차순 정렬');
  }
  assert.ok(cards.length >= 5, '여러 안내가 함께 노출');
});

test('입력이 비어 있어도 안내 생성이 실패하지 않는다', () => {
  const r = calculate({});
  const cards = buildAdvice(r, {});
  assert.ok(Array.isArray(cards));
});
