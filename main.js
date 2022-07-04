/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
'use strict';
const utils = require('@iobroker/adapter-core');
const axios = require('axios').default;
const crypto = require('crypto-js/sha256');

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
		//
		this.stationId = null;
		this.deviceId = null;
		this.deviceSn = null;
		this.hash = null;
		this.token = null;
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

		this.http.interceptors.response.use((response) => this.invalidTokenResponseInterceptor(response), function (error) {
			return Promise.reject(error);
		});
	}

	async invalidTokenResponseInterceptor(response){
		console.log('==== interceptor ====');
		if(response.data.msg){

			if(response.data.msg === 'auth invalid token') {
				console.log('iTRI');
				console.log(this.maxGetToken);
				if(this.maxGetToken < 1) return Promise.reject('could not retrieve token.');
				this.maxGetToken--;

				delete this.http.defaults.headers.common['Authorization'];

				this.token = await this.getToken();
				console.log(this.token);
				this.extendForeignObject('system.adapter.' + 'solarmanpv', {
					native: {
						aktiveToken: this.token
					}
				});

				if(!this.token) return Promise.reject('No valid token.');

				this.http.defaults.headers.common['Authorization'] = 'bearer ' + this.token;

				const config = response.config;
				if (config.headers) {
					config.headers.Authorization = 'bearer ' + this.token;
				}
				response = await this.http.request(config);
			} else {
				return Promise.reject(response);
			}
		}
		return response;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.debug(`[onReady] started`);
		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:

		console.log('==== Start <S> ====');

		//this.invalidTokenResponseInterceptor('hallo');

		if (!this.config.email || !this.config.password) {
			this.log.error(`User email and/or user password empty - please check instance configuration`);
			return;
		}

		if (!this.config.appId || !this.config.appSecret) {
			this.log.error(`Solarman APP ID and/or APP Secrets empty - please check instance configuration`);
			return;
		}

		// read token
		const object = await this.getForeignObjectAsync('system.adapter.solarmanpv');
		if (typeof(object) !== 'undefined' && object !== null){
			this.token = object.native.aktiveToken;
			//this.token = 'halloFalscherToken';
			this.log.debug('intern token: ' + this.token);
		}

		// add bearer token to header of axios instance for next requests
		this.http.defaults.headers.common['Authorization'] = 'bearer ' + this.token;

		// start delaying
		console.log('==== TRY ====');
		try {
			// get station-id via api-call
			await this.initializeStation();
			if (typeof(this.stationId) != 'undefined' && this.stationId != null){
				this.log.info('Station ID: ' + this.stationId);
			} else {
				this.log.warn('no valid station ID found.');
				return;
			}

			// get device-id/sn via api-call
			if (await this.initializeInverter()) {
				this.log.error('Konnte Inverter nicht initialisieren!');
				return;
			}

			// get data from station via api-call
			await this.getStationData().then(result =>
				this.updateStationData(result));

			// get data from device via api-call
			await this.getDeviceData().then(result =>
				this.updateDeviceData(result));
		}
		catch (error) {
			this.log.error(`[onReady] error: ${error}`);
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
		console.log('=== updateDeviceData ===');
		//console.log(data.stringify());

		if (typeof(data) == 'undefined' || data == null){
			this.log.warn('Konnte keine Daten abholen!');
			return;
		}
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
		//this.deviceId = '9988776655';
		this.log.debug(`[getDeviceData] Device ID >: ${this.deviceId} and Device SN >: ${this.deviceSn}`);

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
			.catch((error) => {
				this.log.error(`[getDeviceData] error: ${error.data.msg}`);		// device no upload records found
			});
	}

	// get station data from api
	getStationData() {
		this.log.debug(`[getStationData] Station ID >: ${this.stationId}`);
		return this.http
			.post(
				'/station/v1.0/realTime?language=en', // language parameter does not show any effect
				{ stationId: this.stationId }
			)
			.then((response) => {
				//if(response.data.msg === 'auth invalid token') return Promise.reject('Invalid-Token');		//throw 'InvalidToken';
				return response.data;
			})
			.catch((error) => {
				this.log.error(`[getStationData] error: ${error}`);
			});
	}

	// get inverter-id from api
	initializeInverter() {
		//this.stationId = '1234567';
		this.log.debug(`[initializeInverter] StationID >: ${this.stationId}`);

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
				this.log.debug(`[initializeInverter] Device SN <: ${response.data.deviceListItems[0].deviceSn}`);
				this.deviceSn = response.data.deviceListItems[0].deviceSn;
				this.log.debug(`[initializeInverter] Device ID <: ${response.data.deviceListItems[0].deviceId}`);
				this.deviceId = response.data.deviceListItems[0].deviceId;
				return 0;
			})
			.catch((error) => {
				this.log.debug(`[initializeInverter] error: ${error}`);
				//this.log.debug(error.name);
				//this.log.debug(error.message);
				return 1;
			});
	}

	// get station-id from api
	initializeStation() {
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
				this.stationId = objStationList[0].id;
				this.log.debug(`[initializeStation] data <: ${this.stationId}`);
				return 0;
			})
			/*
			.catch(function (error) {
				self.log.error(`[initializeStation] error: ${error}`);
				return 1;
			*/
			.catch((error) => {
				this.log.error(`[initializeStation] error: ${error}`);
				return 1;
			});
	}

	// get Token from api
	async getToken() {
		console.log('==== Token ====');
		this.log.debug('[getToken] config email: ' + this.config.email);
		this.log.debug('[getToken] config password: ' + this.config.password);
		this.log.debug('[getToken] config appId: ' + this.config.appId);
		this.log.debug('[getToken] config appSecret: ' + this.config.appSecret);
		//	Hashwwert (sha256) des Passworts erzeugen
		this.hash = crypto(this.config.password).toString();
		this.log.debug('[getToken] intern hash: ' + this.hash);

		// Fehlersimulation!!
		//this.config.email ='raschy@gmx.de';
		//this.config.appId = '123456789';
		//this.config.appSecret = '987654321';

		return await this.http
			.post('/account/v1.0/token?appId=' + this.config.appId + '&language=en', {
				appSecret: this.config.appSecret,
				email: this.config.email,
				password: this.hash,
			})
			.then((response) => {
				this.log.debug(`[getToken] debug: ${response.data.access_token}`);
				return response.data.access_token;
			})
			.catch(error => this.apiErrorHandler(error));
		/*
			.catch(function (error) {
				//self.apiErrorHandler(error);
				console.log (`[getToken] error: ${error}`);
				//self.log.info('Achtung');
				//self.log.error(`[getToken] error: ${error.data.msg}`);
				//console.log (error);
				//self.log.error(`[getToken] error: ${error.data.msg}`);
			});
		*/
	}

	apiErrorHandler(error){
		if (typeof(error) == 'string'){
			this.log.info(`[apiErrorHandler] String: ${error}`);
		}
		if (typeof(error) == 'object'){
			try	{
				const json = JSON.parse(error.data.msg);
				this.log.info(`[apiErrorHandler] Json: ${json.code}`);			//AUTH_INVALID_USERNAME_OR_PASSWORD
			}
			catch (error) {
				this.log.info(`[apiErrorHandler] String 1: ${error.data.msg}`);	//auth invalid appId
			}
		}
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