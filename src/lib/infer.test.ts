import { describe, expect, it } from 'vitest';
import { cellToText, describeCellType, guessColumnType, inferCellValue, looksLikeNumber } from './infer';

describe('number detection', () => {
  it('accepts plain integers, negatives, decimals and exponents', () => {
    expect(looksLikeNumber('123')).toBe(true);
    expect(looksLikeNumber('-42')).toBe(true);
    expect(looksLikeNumber('0')).toBe(true);
    expect(looksLikeNumber('0.5')).toBe(true);
    expect(looksLikeNumber('-12.75')).toBe(true);
    expect(looksLikeNumber('1e6')).toBe(true);
    expect(looksLikeNumber('2.5E-3')).toBe(true);
  });

  it('rejects values that must stay text', () => {
    expect(looksLikeNumber('00123')).toBe(false); // leading zeros (postal code / account no.)
    expect(looksLikeNumber('1,234')).toBe(false);
    expect(looksLikeNumber('12 345')).toBe(false);
    expect(looksLikeNumber('1.2.3')).toBe(false);
    expect(looksLikeNumber('+5')).toBe(false);
    expect(looksLikeNumber('')).toBe(false);
    expect(looksLikeNumber('12px')).toBe(false);
    expect(looksLikeNumber('١٢٣')).toBe(false); // non ASCII digits
  });

  it('keeps long digit strings as text so precision cannot be lost', () => {
    expect(looksLikeNumber('123456789012345')).toBe(true); // 15 digits: safe
    expect(looksLikeNumber('1234567890123456')).toBe(false); // 16 digits: unsafe
    expect(looksLikeNumber('13800138000')).toBe(true); // 11 digit phone fits, but…
    expect(inferCellValue('13800138000')).toBe(13800138000);
    // …IDs with 18 digits never become numbers
    expect(inferCellValue('110101199003071234')).toBe('110101199003071234');
  });
});

describe('inferCellValue', () => {
  it('keeps empty text empty and never turns it into null or 0', () => {
    expect(inferCellValue('')).toBe('');
    expect(inferCellValue('   ')).toBe('   ');
  });

  it('recognises only true/false as booleans', () => {
    expect(inferCellValue('true')).toBe(true);
    expect(inferCellValue('FALSE')).toBe(false);
    expect(inferCellValue('yes')).toBe('yes');
    expect(inferCellValue('1')).toBe(1);
  });

  it('preserves the literal null family as text', () => {
    expect(inferCellValue('null')).toBe('null');
    expect(inferCellValue('NULL')).toBe('NULL');
    expect(inferCellValue('NaN')).toBe('NaN');
  });

  it('is bypassed when inference is disabled', () => {
    expect(inferCellValue('123', false)).toBe('123');
    expect(inferCellValue('true', false)).toBe('true');
  });
});

describe('type helpers', () => {
  it('guesses a column type from values', () => {
    expect(guessColumnType([1, 2, 3])).toBe('number');
    expect(guessColumnType(['a', 'b'])).toBe('text');
    expect(guessColumnType([true, false])).toBe('boolean');
    expect(guessColumnType([1, 'a'])).toBe('mixed');
    expect(guessColumnType([null, ''])).toBe('empty');
  });

  it('serialises structured cells as JSON text', () => {
    expect(cellToText({ a: 1 })).toBe('{"a":1}');
    expect(cellToText([1, 2])).toBe('[1,2]');
    expect(cellToText(null)).toBe('');
    expect(cellToText(undefined)).toBe('');
    expect(cellToText(false)).toBe('false');
  });

  it('describes cell kinds used by the grid', () => {
    expect(describeCellType('')).toBe('empty');
    expect(describeCellType(null)).toBe('null');
    expect(describeCellType(0)).toBe('number');
    expect(describeCellType(false)).toBe('boolean');
    expect(describeCellType('x')).toBe('text');
    expect(describeCellType({ a: 1 })).toBe('structured');
  });
});
