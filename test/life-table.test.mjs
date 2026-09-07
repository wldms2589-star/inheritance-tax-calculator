import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIFE_TABLE,
  LIFE_TABLE_YEAR,
  MAX_TABLE_AGE,
  getLifeExpectancy,
  getDeductionYears,
} from '../assets/js/life-table.js';

test('완전생명표는 0세부터 빠짐없이 이어진다', () => {
  assert.equal(LIFE_TABLE.length, MAX_TABLE_AGE + 1);
  LIFE_TABLE.forEach((row, i) => {
    assert.equal(row[0], i, `${i}번째 행의 연령`);
    assert.equal(row.length, 4, '연령, 전체, 남자, 여자');
  });
});

test('기준연도가 표에 기록되어 있다', () => {
  assert.equal(typeof LIFE_TABLE_YEAR, 'number');
  assert.ok(LIFE_TABLE_YEAR >= 2020, '최근 생명표');
});

test('공표된 기대여명 값과 일치한다', () => {
  // 통계청 2024년 완전생명표 공표치
  assert.equal(getLifeExpectancy(0, 'all'), 83.7);
  assert.equal(getLifeExpectancy(0, 'male'), 80.8);
  assert.equal(getLifeExpectancy(0, 'female'), 86.6);
  assert.equal(getLifeExpectancy(60, 'male'), 23.7);
  assert.equal(getLifeExpectancy(60, 'female'), 28.4);
});

test('성별을 지정하지 않으면 전체 기대여명을 쓴다', () => {
  assert.equal(getLifeExpectancy(40), getLifeExpectancy(40, 'all'));
});

test('모든 연령에서 여자의 기대여명이 남자보다 길다', () => {
  LIFE_TABLE.forEach(([age, , male, female]) => {
    assert.ok(female >= male, `${age}세: 여 ${female} / 남 ${male}`);
  });
});

test('나이가 많아질수록 기대여명이 줄어든다', () => {
  for (let age = 1; age <= MAX_TABLE_AGE; age += 1) {
    assert.ok(
      getLifeExpectancy(age, 'male') <= getLifeExpectancy(age - 1, 'male'),
      `${age}세 남자`,
    );
  }
});

test('장애인공제 연수는 1년 미만을 1년으로 올린다', () => {
  // 65세 남자 기대여명 19.5년 → 20년
  assert.equal(getLifeExpectancy(65, 'male'), 19.5);
  assert.equal(getDeductionYears(65, 'male'), 20);

  // 정수로 떨어지는 경우는 그대로
  const age = LIFE_TABLE.findIndex(([, , m]) => Number.isInteger(m));
  if (age >= 0) {
    assert.equal(getDeductionYears(age, 'male'), getLifeExpectancy(age, 'male'));
  }
});

test('소수점이 있는 나이는 내림해서 조회한다', () => {
  assert.equal(getLifeExpectancy(40.9, 'male'), getLifeExpectancy(40, 'male'));
});

test('표의 마지막 연령을 넘으면 마지막 값을 쓴다', () => {
  assert.equal(getLifeExpectancy(120, 'male'), getLifeExpectancy(MAX_TABLE_AGE, 'male'));
  assert.ok(getDeductionYears(150, 'female') > 0, '계산이 실패하지 않음');
});

test('잘못된 나이는 null을 돌려준다', () => {
  assert.equal(getLifeExpectancy(-1), null);
  assert.equal(getLifeExpectancy('abc'), null);
  assert.equal(getDeductionYears(-5, 'male'), null);
});

test('장애인공제 금액은 기대여명 연수 × 1천만원이다', () => {
  const 만 = 10000;
  // 30세 여자를 예로 실제 공제액을 확인
  const years = getDeductionYears(30, 'female');
  assert.ok(years > 50, '30세 여자의 기대여명은 50년을 넘는다');
  assert.equal(years * 1000 * 만, years * 10000000);
});
