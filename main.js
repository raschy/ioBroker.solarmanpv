/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
'use strict';
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios').default;
const crypto = require('crypto-js/sha256');

this.tmpStationId = null;
this.stationId = null;
this.deviceId = null;
this.deviceSn = null;
this.hash = null;
this.token = null;

class Solarmanpv extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'solarmanpv',
		});

		const self = this;

		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));
		//
		this.maxGetToken = 1;
		//
		this.baseUrl = 'https://api.solarmanpv.com';
		this.http = axios.create({
			baseURL: this.baseUrl,
			timeout: 3000,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		this.http.interceptors.response.use(async function (response) {
			// Any status code that lie within the range of 2xx cause this function to trigger
			// Do something with response data

			if(response.data.msg){

				if(response.data.msg === 'auth invalid token') {
					if(self.maxGetToken < 1) return Promise.reject('could not retrieve token.');
					self.maxGetToken--;

					delete self.http.defaults.headers.common['Authorization'];
					self.token = await self.getToken();

					self.extendForeignObject('system.adapter.' + 'solarmanpv', {
						native: {
							aktiveToken: self.token
						}
					});

					if(!self.token) return Promise.reject('No valid token.');

					self.http.defaults.headers.common['Authorization'] = 'bearer ' + self.token;

					const config = response.config;
					if (config.headers) {
						config.headers.Authorization = 'Bearer ' + self.token;
					}
					response = await self.http.request(config);
				} else {
					return Promise.reject(response);
				}
			}
			return response;
		},	function (error) {
			// Any status codes that falls outside the range of 2xx cause this function to trigger
			// Do something with response error
			return Promise.reject(error);
		});
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.debug(`[onReady] started`);
		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:

		console.log('==== Start ====');

		if (!this.config.email || !this.config.password) {
			this.log.error(`User email and/or user password empty - please check instance configuration`);
			return;
		}

		if (!this.config.appId || !this.config.appSecret) {
			this.log.error(`Solarman APP ID and/or APP Secrets empty - please check instance configuration`);
			return;
		}

		const object = await this.getForeignObjectAsync('system.adapter.solarmanpv');
		if (typeof(object) != 'undefined' && object != null){
			this.token = object.native.aktiveToken;
			this.log.debug('intern token: ' + this.token);
		}

		try {
			// add bearer token to header of axios instance for next requests
			this.http.defaults.headers.common['Authorization'] = 'bearer ' + this.token;

			// get station-id via api-call
			this.tmpStationID = await this.getStationId();
			if (typeof(this.tmpStationID) != 'undefined' && this.tmpStationID != null){
				this.stationId = this.tmpStationID;
				this.log.info('Station ID: ' + this.stationId);
			} else {
				this.log.warn('no valid station ID found.');
				return;
			}

			// get device-id/sn via api-call
			await this.getInverterId();


			// get data from station via api-call
			await this.getStationData().then(result =>
				this.updateStationData(result));

			/*
			// get data from device via api-call
			await this.getDeviceData().then(result =>
				this.updateDeviceData(result));
			*/

			await this.getRealTimeData().then(result =>
				this.updateDeviceData(result));

		}
		catch (err) {
			this.log.error(`[onReady] error: ${err}`);
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

	async fillSensorData(device, name, description, value, unit) {
		const dp_Device = this.stationId +'.'+ device +'.'+ name;
		const sensorName = device +'.'+ description;
		this.log.debug(`[fillSensorData] Device "${dp_Device}" sensor "${description}" with Value: "${value}" "${unit}"`);

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
		if (this.isNumeric(value)) {
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
	}

	// update station data in ioBroker
	updateStationData(data) {
		// define keys that shall be updated
		const updateKeys = ['generationPower', 'lastUpdateTime'];

		updateKeys.forEach((key) => {
			//this.log.info('[updateStationData] '+ key + ' Data: ' + data[key]);
			if (key == 'generationPower') {
				//this.log.info('[updateStationData] generationPower : '+ data[key]);
				this.fillSensorData('StationData', key, key, data[key],'W');
			}
			if (key == 'lastUpdateTime') {
				const lastUpdate = new Date(data[key]*1000);
				//this.log.info('[updateStationData] lastUpdateTime : '+ lastUpdate);
				this.fillSensorData('StationData', key, key, lastUpdate,'');
			}
		});
	}

	// update inverter data in ioBroker
	updateDeviceData(data) {
		// define keys that shall be updated (works in dataList only)
		const updateKeys = ['DV1','DV2','DC1','DC2','DP1','DP2','AV1','Et_ge0','Etdy_ge0','AC_RDT_T1','APo_t1'];
		const values = data.dataList.filter((obj) => updateKeys.includes(obj.key));
		values.forEach((obj) => {
			//this.log.info('[updateDeviceData] '+ obj.key + ' Data: ' + obj.value + ' Unit: ' + obj.unit + ' Name: ' + obj.name);
			this.fillSensorData('DeviceData', obj.key, obj.name, obj.value, obj.unit);
		});
	}

	// get inverter data from api
	getDeviceData() {
		const self = this;
		this.log.debug(`[getDeviceData] Device SN >: ${this.deviceSn}`);
		this.log.debug(`[getDeviceData] Device ID >: ${this.deviceId}`);

		return this.http
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
			.catch(function (error) {
				self.log.error(`[getDeviceData] error: ${error}`);
			});
	}

	// get station data from api
	getStationData() {
		const self = this;
		this.log.debug(`[getStationData] Station ID >: ${this.stationId}`);
		return this.http
			.post(
				'/station/v1.0/realTime?language=en', // language parameter does not show any effect
				{ stationId: this.stationId }
			)
			.then((response) => {
				// this.log.error(`[getStationData] msg: ${response.data.msg}`);
				if(response.data.msg === 'auth invalid token') return Promise.reject('Invalid-Token');		//throw 'InvalidToken';
				return response.data;
			})
			.catch(function (error) {
				self.log.error(`[getStationData] error: ${error}`);
			});
	}

	// get realtimedata from api
	getRealTimeData() {
		const self = this;
		this.log.debug(`[getRealTimeData] Device SN >: ${this.deviceSn}`);
		this.log.debug(`[getRealTimeData] Device ID >: ${this.deviceId}`);

		return this.http
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
			.catch(function (error) {
				self.log.error(`[getRealTimeData] error: ${error}`);
			});
	}

	// get inverter-id from api
	getInverterId() {
		const self = this;
		this.log.debug(`[getInverterId] StationID >: ${this.stationId}`);

		return this.http
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
				this.log.debug(`[getInverterId] Device SN <: ${response.data.deviceListItems[0].deviceSn}`);
				this.log.debug(`[getInverterId] Device ID <: ${response.data.deviceListItems[0].deviceId}`);
				this.deviceSn = response.data.deviceListItems[0].deviceSn;
				this.deviceId = response.data.deviceListItems[0].deviceId;
				return;
			})
			.catch(function (error) {
				self.log.error(`[getInverterId] error: ${error}`);
			});
	}

	// get station-id from api
	getStationId() {
		const self = this;
		return this.http
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
				const stationId = objStationList[0].id;
				this.log.debug(`[getStationId] data <: ${stationId}`);
				return stationId;
			})
			.catch(function (error) {
				self.log.error(`[getStationId] error: ${error}`);
			});
	}

	// get Token from api
	async getToken() {
		const self = this;
		this.log.debug('[getToken] config email: ' + this.config.email);
		this.log.debug('[getToken] config password: ' + this.config.password);
		this.log.debug('[getToken] config appId: ' + this.config.appId);
		this.log.debug('[getToken] config appSecret: ' + this.config.appSecret);
		//	Hashwwert (sha256) des Passworts erzeugen
		this.hash = crypto(this.config.password).toString();
		this.log.debug('[getToken] intern hash: ' + this.hash);

		return await this.http
			.post('/account/v1.0/token?appId=' + this.config.appId + '&language=en', {
				appSecret: this.config.appSecret,
				email: this.config.email,
				password: this.hash,
			})
			.then((response) => {
				self.log.debug(`[getToken] debug: ${response.data.access_token}`);
				return response.data.access_token;
			})
			.catch(function (error) {
				self.log.error(`[getToken] error: ${error}`);
			});
	}

	// Beschreibe diese Funktion: Prüfen ob Wert numerisch ist
	isNumeric(n) {
		return !isNaN(parseFloat(n)) && isFinite(n);
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