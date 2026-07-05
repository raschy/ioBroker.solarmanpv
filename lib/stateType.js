'use strict';

const NUMERIC_VALUE_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * @param value value to check
 * @returns true if the value can be stored as an ioBroker number state
 */
function isNumericStateValue(value) {
	if (typeof value === 'number') {
		return Number.isFinite(value);
	}
	if (typeof value !== 'string') {
		return false;
	}

	const trimmedValue = value.trim();
	return trimmedValue !== '' && NUMERIC_VALUE_PATTERN.test(trimmedValue) && Number.isFinite(Number(trimmedValue));
}

/**
 * @param value raw Solarman value
 * @returns value normalized for the ioBroker state type
 */
function normalizeStateValue(value) {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		if (value.trim() === '') {
			return '';
		}
		return isNumericStateValue(value) ? Number(value.trim()) : value;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : String(value);
	}

	return String(value);
}

/**
 * @param value normalized value
 * @returns ioBroker common.type for the value
 */
function getStateType(value) {
	return typeof value === 'number' ? 'number' : 'string';
}

module.exports = {
	getStateType,
	isNumericStateValue,
	normalizeStateValue,
};
