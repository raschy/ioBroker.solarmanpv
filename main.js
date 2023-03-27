/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
'use strict';
const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const crypto5 = require('crypto');
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
		this.stationIdList = [];
	}

	/**
	 * Is called when ApiClient has received new token.
	 */
	async onTokenChanged(token) {
		this.log.debug('[onTokenChanged] token changed: ' + token);
		await this.extendForeignObject('system.adapter.' + this.namespace, {
			native: {
				activeToken: token
			}
		});
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.debug(`[onReady] started: ${this.namespace}`);

		if (!this.config.email || !this.config.password) {
			this.log.error(`User email and/or user password empty - please check instance configuration`);
			return;
		}

		if (!this.config.appId || !this.config.appSecret) {
			this.log.error(`Solarman APP ID and/or APP Secrets empty - please check instance configuration`);
			return;
		}

		//	About User changes
		await this.checkUserData();

		api.email = this.config.email;
		api.password = this.config.password;
		api.appId = this.config.appId;
		api.appSecret = this.config.appSecret;
		api.companyName = this.config.companyName;

		const object = this.config.activeToken;
		if (typeof (object) !== 'undefined' && object !== null) {
			api.token = this.config.activeToken;
		}

		// start with delay
		await this.delay(Math.floor(Math.random() * 5 * 1000));

		try {
			// get station-id via api-call
			await this.initializeStation().then(async result => 
				await this.updateStationData(result));
				
			for (const stationId of this.stationIdList) {
				await this.initializeInverter(stationId).then(async inverterList => {
					for (const inverter of inverterList) {
						await this.getDeviceData(inverter.deviceId, inverter.deviceSn).then(async data =>
							await this.updateDeviceData(stationId, inverter, data));
					}
				});
			}
		}
		catch (error) {
			this.log.debug(JSON.stringify(error));
		}
		finally {
			this.log.debug(`[onReady] finished - stopping instance`);
			//await this.delay(2000);
			this.terminate ? this.terminate('Everything done. Going to terminate till next schedule', 11) : process.exit(0);
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

	// saving data in ioBroker object
	async persistData(station, device, name, description, value, role, unit) {
		let dp_Folder;
		let sensorName;
		if (device == '') {
			dp_Folder = String(station);
			sensorName = station +'.'+ description;
		} else {
			dp_Folder = String(station) +'.'+ String(device);
			sensorName = device +'.'+ description;
		}
		const dp_Device = String(dp_Folder +'.'+ name);
		//this.log.debug(`[persistData] Station "${station}" Device "${device}" Name "${name}" Sensor "${description}" with value: "${value}" and unit "${unit}" as role "${role}`);

		/*
		await this.setObjectNotExistsAsync(dp_Folder, {
			type: 'device',
			common: {
				name: device
			},
			native: {}
		});
*/

		// Type-Erkennung
		let type = 'string';
		if (isNumeric(value)) {
			type = 'number';
			value = parseFloat(value);
		}
		if (typeof value === 'object') {
			type = 'string';
			value = JSON.stringify(value);
		}

		await this.setObjectNotExistsAsync(dp_Device, {
			type: 'state',
			common: {
				name: sensorName,
				role: role,
				type: type,
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
	async updateDeviceData(stationId, inverter, data) {
		await this.persistData(stationId, inverter.deviceId, 'connectStatus', 'connectStatus', inverter.connectStatus, 'state', '');
		await this.persistData(stationId, inverter.deviceId, 'collectionTime', 'collectionTime', inverter.collectionTime * 1000, 'date', '');

		// define keys that shall not be updated (works in dataList only)
		const noUpdateKeys = JSON.parse(JSON.stringify(this.config.deviceBlacklist.split(',')));
/*
		data.dataList.forEach(async obj => {
			const result = noUpdateKeys.includes(obj.key);
			if (!result || obj.value == 'none') {
				await this.persistData(stationId, inverter.deviceId, obj.key, obj.name, obj.value, 'state', obj.unit);
			}
		});
*/
		for(const obj of data.dataList){
			const result = noUpdateKeys.includes(obj.key);
			if (!result || obj.value == 'none') {
				await this.persistData(stationId, inverter.deviceId, obj.key, obj.name, obj.value, 'state', obj.unit);
			}
		}

	}

	// update station data in ioBroker
	async updateStationData(data) {
		for (const obj of data) {
			// define keys that shall be updated
			const updateKeys = [['name', 'state', ''],
				['generationPower','value.power', 'W'],
				['networkStatus','state',''],
				['lastUpdateTime','date', '']];
			/*
			updateKeys.forEach(async key => {
				if (key[0] == 'lastUpdateTime') { 	// special case 'lastUpdateTime'
					obj[key[0]] *= 1000;
				}
				await this.persistData(obj['id'], '', key[0], key[0], obj[key[0]], key[1], key[2]);
			});
*/
			for(const key of updateKeys){
				if (key[0] == 'lastUpdateTime') { 	// special case 'lastUpdateTime'
					obj[key[0]] *= 1000;
				}
				await this.persistData(obj['id'], '', key[0], key[0], obj[key[0]], key[1], key[2]);
			}

		}
	}

	// get inverter data from api
	async getDeviceData(deviceId, deviceSn) {
		this.log.debug(`[getDeviceData] Device ID >: ${deviceId} and Device SN >: ${deviceSn}`);
		return api.axios
			.post(
				'/device/v1.0/currentData?language=en', // language parameter does not show any effect
				{
					deviceId: deviceId,
					deviceSn: deviceSn
				}
			)
			.then((response) => {
				return response.data;
			})
			.catch((error) => {
				//this.log.warn(`[getDeviceData] ${error}`);
				return Promise.reject(error);
			});
	}

	// get inverter-id from api
	async initializeInverter(stationId) {
		this.log.debug(`[initializeInverter] StationID >: ${stationId}`);
		return api.axios
			.post(
				'/station/v1.0/device?language=en', // language parameter does not show any effect
				{
					page: 1,
					size: 10,
					stationId : stationId
				}
			)
			.then((response) => {
				return(response.data.deviceListItems);
			})
			.catch((error) => {
				this.log.warn(`[initializeInverter] error: ${error.code}`);
				return Promise.reject(error);
			});
	}

	// get station-id from api (multiple)
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
					for (const obj of response.data.stationList) {
					this.stationIdList.push(obj['id']);		// StationId's for devices
				}
				return response.data.stationList;
			})
			.catch((error) => {
				this.log.warn(`[initializeStation] error: ${error.code}`);
				return Promise.reject(error);
			});
	}

	async checkUserData(){

		let inputData = this.config.email + this.config.password + this.config.appId + this.config.appSecret + this.config.companyName
		let crc = crypto5.createHash('md5').update(inputData).digest('hex');
		// get oldCRC		
		this.log.debug(`[checkUserData] start`);
		const object = await this.getStateAsync('checksumUserData');
		if (typeof (object) !== 'undefined' && object !== null) {
			this.oldCrc = object?.val;
		}
		this.log.debug(`[checkUserData] oldCrc ${this.oldCrc}`);
		// compare to previous config
		if(!this.oldCrc || this.oldCrc != crc) {
			this.log.debug(`[checkUserData] has changed or is new; previous crc: ${this.oldCrc}`);
  			// store new crc
 			this.log.debug(`[checkUserData] store new hash: ${crc}`);
			// write datapoint
			 await this.setObjectNotExistsAsync('checksumUserData', {
				type: 'state',
				common: {
					name: {
						"en": "Checksum user data",
						"de": "Checksumme Benutzerdaten",
						"ru": "Проверьте данные пользователя Checksum",
						"pt": "Dados do usuário do checksum",
						"nl": "Vertaling:",
						"fr": "Vérifier les données utilisateur",
						"it": "Dati utente di checksum",
						"es": "Datos de usuario de checksum",
						"pl": "Checksum data",
						"uk": "Перевірити дані користувачів",
						"zh-cn": "用户数据"
					},
					type: 'string',
					role: 'state',
					read: true,
					write: false,
				},
				native: {},
			});
			await this.setStateAsync('checksumUserData', { val: crc, ack: true });
			// delete Token
			await this.extendForeignObject('system.adapter.' + this.namespace, {
				native: {
					activeToken: ''
				}
			});
		}
		return
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