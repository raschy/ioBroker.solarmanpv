'use strict';

const { getStateType, normalizeStateValue } = require('./lib/stateType.js');

describe('state type handling', () => {
	const stringCases = [
		[null, ''],
		[undefined, ''],
		['', ''],
		[' ', ''],
		['--', '--'],
		['N/A', 'N/A'],
		['none', 'none'],
		['null', 'null'],
		[Infinity, 'Infinity'],
		[NaN, 'NaN'],
		['0x10', '0x10'],
		[true, 'true'],
		[false, 'false'],
	];

	for (const [input, expected] of stringCases) {
		it(`normalizes ${String(input)} as string`, () => {
			const value = normalizeStateValue(input);
			value.should.equal(expected);
			getStateType(value).should.equal('string');
		});
	}

	const numberCases = [
		['0', 0],
		['42', 42],
		[' 42 ', 42],
		['-13.5', -13.5],
		['.5', 0.5],
		['1e3', 1000],
		[23, 23],
	];

	for (const [input, expected] of numberCases) {
		it(`normalizes ${String(input)} as number`, () => {
			const value = normalizeStateValue(input);
			value.should.equal(expected);
			getStateType(value).should.equal('number');
		});
	}
});
