/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
'use strict';
const utils = require('@iobroker/adapter-core');
const api = require('./solarmanpvApiClient.js');

class Solarmanpv extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'solarmanpv',
		});

		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));
		api.eventEmitter.on('tokenChanged', this.onTokenChanged.bind(this));
		//
		this.stationId = null;
		this.deviceId = null;
		this.deviceSn = null;
		this.hash = null;
		this.token = null;
	}

	/**
	 * Is called when ApiClient has received new token.
	 */
	onTokenChanged(token) {
		this.log.debug('[onReady] token changed: ' + token);
		this.extendForeignObject('system.adapter.' + 'solarmanpv', {
			native: {
				aktiveToken: token
			}
		});
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.debug(`[onReady] started`);

		if (!this.config.email || !this.config.password) {
			this.log.error(`User email and/or user password empty - please check instance configuration`);
			return;
		}

		if (!this.config.appId || !this.config.appSecret) {
			this.log.error(`Solarman APP ID and/or APP Secrets empty - please check instance configuration`);
			return;
		}

		api.email = this.config.email;
		api.password = this.config.password;
		api.appId = this.config.appId;
		api.appSecret = this.config.appSecret;

		const object = await this.getForeignObjectAsync('system.adapter.solarmanpv');
		if (typeof(object) !== 'undefined' && object !== null){
			this.token = object.native.aktiveToken;
			this.log.debug('[onReady] intern token: ' + this.token);
			api.token = this.token;
		}

		// start with shift
		await this.shift(1000);
		console.log('==== TRY ====');

		try {
			// get station-id via api-call
			await this.initializeStation();

			// get device-id/sn via api-call
			await this.initializeInverter();

			// get data from station via api-call
			await this.getStationData().then(result =>
				this.updateStationData(result))
				.catch(() => { return; /* DOING NOTHING TO INSURE FURTHER EXECUTION */});

			// get data from device via api-call
			await this.getDeviceData().then(result =>
				this.updateDeviceData(result));
		}
		catch (error) {
			this.log.error(`[onReady] error: ${error}`);
			this.log.debug(JSON.stringify(error));
		}
		finally {
			this.log.debug(`[onReady] finished - stopping instance`);
			if(typeof this.stop === 'function') {
				this.stop();
			}
		}
	// End onReady
	}
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			this.log.debug('[callback] cleaned everything up...');
			callback();
		} catch (e) {
			callback();
			this.log.error('callback catch');
		}
	}

	async persistData(device, name, description, value, unit) {
		const dp_Device = this.stationId +'.'+ device +'.'+ name;
		const sensorName = device +'.'+ description;
		this.log.debug(`[persistData] Device "${dp_Device}" sensor "${description}" with value: "${value}" and unit "${unit}"`);

		await this.setObjectNotExistsAsync(this.stationId +'.'+ device, {
			type: 'device',
			common: {
				name: device
			},
			native: {}
		});
		/*
			await this.extendObjectAsync(Device, {
				common: {
					name: sensorName
				}
						});
		*/
		// Type-Erkennung
		let	_type = 'string';
		if (isNumeric(value)) {
			_type = 'number';
			value = parseFloat(value);
		}
		if (typeof value === 'object') {
			_type = 'object';
			value = JSON.stringify(value);
		}

		await this.setObjectNotExistsAsync(dp_Device, {
			type: 'state',
			common: {
				name: sensorName,
				role: 'state',
				type: _type,
				// @ts-ignore
				unit: unit,
				read: true,
				write: false
			},
			native: {}
		});

		await this.setStateAsync(dp_Device, {val: value, ack: true});

		// Beschreibe diese Funktion: Prüfen ob Wert numerisch ist
		function isNumeric(n) {
			return !isNaN(parseFloat(n)) && isFinite(n);
		}
	}

	// update inverter data in ioBroker
	updateDeviceData(data) {
		// define keys that shall be updated (works in dataList only)
		const updateKeys = ['DV1','DV2','DC1','DC2','DP1','DP2','AV1','Et_ge0','Etdy_ge0','AC_RDT_T1','APo_t1'];
		const values = data.dataList.filter((obj) => updateKeys.includes(obj.key));
		values.forEach((obj) => {
			//this.log.info('[updateDeviceData] '+ obj.key + ' Data: ' + obj.value + ' Unit: ' + obj.unit + ' Name: ' + obj.name);
			this.persistData('DeviceData', obj.key, obj.name, obj.value, obj.unit);
		});
	}

	// update station data in ioBroker
	updateStationData(data) {
		// define keys that shall be updated
		const updateKeys = ['generationPower', 'lastUpdateTime'];
		updateKeys.forEach((key) => {
			if (key == 'generationPower') {
				//this.log.info('[updateStationData] generationPower : '+ data[key]);
				this.persistData('StationData', key, key, data[key],'W');
			}
			if (key == 'lastUpdateTime') {
				const lastUpdate = new Date(data[key]*1000);
				//this.log.info('[updateStationData] lastUpdateTime : '+ lastUpdate);
				this.persistData('StationData', key, key, lastUpdate,'');
			}
		});
	}

	// get inverter data from api
	getDeviceData() {
		this.log.debug(`[getDeviceData] Device ID >: ${this.deviceId} and Device SN >: ${this.deviceSn}`);

		return api.axios
			.post(
				'/device/v1.0/currentData?language=en', // language parameter does not show any effect
				{
					deviceId: this.deviceId,
					deviceSn: this.deviceSn
				}
			)
			.then((response) => {
				return response.data;
			})
			.catch((error) => {
				this.log.warn(`[getDeviceData] error: ${error}`);		// device no upload records found
				return Promise.reject(error);
			});
	}

	// get station data from api
	getStationData() {
		this.log.debug(`[getStationData] Station ID >: ${this.stationId}`);
		return api.axios
			.post(
				'/station/v1.0/realTime?language=en', // language parameter does not show any effect
				{ stationId: this.stationId }
			)
			.then((response) => {
				return response.data;
			})
			.catch((error) => {
				this.log.warn(`[getStationData] error: ${error}`);
				return Promise.reject(error);
			});
	}

	// get inverter-id from api
	initializeInverter() {
		this.log.debug(`[initializeInverter] StationID >: ${this.stationId}`);

		return api.axios
			.post(
				'/station/v1.0/device?language=en', // language parameter does not show any effect
				{
					page: 1,
					size: 10,
					deviceType: 'MICRO_INVERTER',
					stationId : this.stationId
				}
			)
			.then((response) => {
				this.log.debug(`[initializeInverter] Device SN <: ${response.data.deviceListItems[0].deviceSn}`);
				this.deviceSn = response.data.deviceListItems[0].deviceSn;
				this.log.debug(`[initializeInverter] Device ID <: ${response.data.deviceListItems[0].deviceId}`);
				this.deviceId = response.data.deviceListItems[0].deviceId;
				return response;
			})
			.catch((error) => {
				this.log.warn(`[initializeInverter] error: ${error}`);
				return Promise.reject(error);
			});
	}

	// get station-id from api
	initializeStation() {
		return api.axios
			.post(
				'/station/v1.0/list?language=en', // language parameter does not show any effect
				{
					page: 1,
					size: 20
				}
			)
			.then((response) => {
				//const total = response.data.total;	// Anzahl der Plants
				const objStationList = response.data.stationList;
				this.stationId = objStationList[0].id;
				this.log.info(`[initializeStation] Station: ${this.stationId}`);
				return response;
			})
			.catch((error) => {
				this.log.warn(`[initializeStation] error: ${error}`);
				console.log(error);
				return Promise.reject(error);
			});
	}

	// Start shift for api-call
	shift(msmin) {
		const ms = Math.floor(Math.random() * 5 * msmin + msmin);
		this.log.debug('[onReady] Start shift with ' + ms + ' ms');
		return new Promise(resolve => setTimeout(resolve, ms));
	}
// End Class
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Solarmanpv(options);
} else {
	// otherwise start the instance directly
	new Solarmanpv();
}