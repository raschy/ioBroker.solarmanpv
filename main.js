/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
'use strict';
const utils = require('@iobroker/adapter-core');
const crypto5 = require('crypto');
const api = require('./lib/solarmanpvApiClient.js');

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
		this.modulList = [];
		this.modulSelect = [];
		this.toZero = false;
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
		await this.delay(Math.floor(Math.random() * 5000));

		try { // [main]
			// get station-id via api-call
			await this.initializeStation().then(async result =>
				await this.updateStationData(result));

			for (const stationId of this.stationIdList) {
				await this.initializeInverter(stationId).then(async inverterList => {
					await this.manageInverterDevice(inverterList);
					for (const inverter of inverterList) {
						await this.getDeviceData(inverter.deviceId, inverter.deviceSn).then(async data =>
							await this.updateDeviceData(stationId, inverter, data)).catch((error) => {
								this.log.debug(`[iterate devices] Device ID: ${inverter.deviceId} skipped`);
							});
					}
				});
			}
		}
		catch (error) {
			this.log.debug(`[main] catch ${JSON.stringify(error)}`);
		}
		finally {
			this.log.debug(`[onReady] finished - stopping instance`);
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

	/**
	 * saving data in ioBroker object
	 * @param {*} station 
	 * @param {*} device 
	 * @param {*} name 
	 * @param {*} description 
	 * @param {*} value 
	 * @param {*} role 
	 * @param {*} unit 
	 * @param {boolean} nullable 
	 */
	async persistData(station, device, name, description, value, role, unit, nullable) {
		let dp_Folder;
		let sensorName;
		if (device == '') {
			dp_Folder = String(station);
			sensorName = station + '.' + description;
		} else {
			dp_Folder = String(station) + '.' + String(device);
			sensorName = device + '.' + description;
		}
		const dp_Device = String(dp_Folder + '.' + name);
		//this.log.debug(`[persistData] Station "${station}" Device "${device}" Name "${name}" Sensor "${description}" with value: "${value}" and unit "${unit}" as role "${role}`);

		await this.setObjectNotExistsAsync(dp_Folder, {
			type: 'device',
			common: {
				name: String(device)
			},
			native: {}
		});

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
				// @ts-ignore
				type: type,
				// @ts-ignore
				unit: unit,
				read: true,
				write: false
			},
			native: {}
		});
		// Differentiated writing of data
		if (nullable) {
			await this.setStateAsync(dp_Device, { val: 0, ack: true, q: 0x42 }); // Nullable values while device is not present
		} else {
			await this.setStateAsync(dp_Device, { val: value, ack: true, q: 0x00 });
		}
		// Beschreibe diese Funktion: Prüfen ob Wert numerisch ist
		function isNumeric(n) {
			return !isNaN(parseFloat(n)) && isFinite(n);
		}
	}

	/**
	 * update inverter data in ioBroker
 	 * @param {*} stationId 
	 * @param {*} inverter 
	 * @param {*} data 
	 */
	async updateDeviceData(stationId, inverter, data) {
		// only selected moduls
		for (const obj of this.modulList) {
			if (!this.modulSelect.includes(obj['modul'])) {
				if (obj['checkSelect']) {
					this.modulSelect.push(obj['modul']);
				}
			}
		}

		if (this.modulSelect.includes(inverter.deviceId)) {
			this.log.debug(`[updateDeviceData] Device ID: ${inverter.deviceId}`);
			await this.persistData(stationId, inverter.deviceId, 'deviceType', 'deviceType', inverter.deviceType, 'state', '', false);
			await this.persistData(stationId, inverter.deviceId, 'connectStatus', 'connectStatus', inverter.connectStatus, 'state', '', false);
			await this.persistData(stationId, inverter.deviceId, 'collectionTime', 'collectionTime', inverter.collectionTime * 1000, 'date', '', false);
			const isOffline = inverter.connectStatus == 0 ? true : false;
			// blacklist-keys that shall not be updated
			for (const obj of data.dataList) {
				const result = this.config.deviceBlacklist.includes(obj.key);
				if (!result && obj.value != 'none') {
					const setToZero = (isOffline && this.config.deviceZero.includes(obj.key));
					await this.persistData(stationId, inverter.deviceId, obj.key, obj.name, obj.value, 'state', obj.unit, setToZero);
				} else {
					await this.deleteDeviceState(stationId, inverter.deviceId, obj.key);
				}
			}
		} else {
			await this.deleteDeviceObject(stationId, inverter.deviceId);
		}
	}

	/**
	 * update station data in ioBroker
	 * @param {*} data 
	 */
	async updateStationData(data) {
		for (const obj of data) {
			// define keys that shall be updated
			const updateKeys = [['name', 'state', ''],
			['generationPower', 'value.power', 'W'],
			['networkStatus', 'state', ''],
			['lastUpdateTime', 'date', '']];

			for (const key of updateKeys) {
				if (key[0] == 'lastUpdateTime') { 	// special case 'lastUpdateTime'
					obj[key[0]] *= 1000;
				}
				await this.persistData(obj['id'], '', key[0], key[0], obj[key[0]], key[1], key[2], false);
			}

		}
	}

	/**
	 * get inverter data from api
	 * @param {number} deviceId 
	 * @param {number} deviceSn 
	 * @returns 
	 */
	async getDeviceData(deviceId, deviceSn) {
		this.log.debug(`[getDeviceData] Device ID: ${deviceId} with Device SN: ${deviceSn}`);
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
				this.log.warn(`[getDeviceData] ${error} ID: ${deviceId}`);
				return Promise.reject(error);
			});
	}

	/**
	 * Collects the device IDs that were read in order to subsequently save 
	 * them in the configuration.
	   * @param {*} inverterList 
	 */
	async manageInverterDevice(inverterList) {
		let modulListChanged = false;
		this.modulList = this.config.deviceModules;
		let isArray = Array.isArray(this.modulList);
		if (!isArray || this.config.clearModules) {
			this.modulList = [];
			this.log.debug(`[manageInverterDevice] Modullist cleared`);
		}

		// add new devices
		for (const inverter of inverterList) {
			if (!this.modulList.find(element => element.modul == inverter.deviceId)) {
				this.log.debug(`[manageInverterDevice] ADD: ${inverter.deviceId}`);
				this.modulList.push({ modul: inverter.deviceId, checkSelect: true });	//default
				modulListChanged = true;
			}
		}

		// write into config if changes
		if (modulListChanged) {
			this.getForeignObject('system.adapter.' + this.namespace, (err, obj) => {
				if (err) {
					this.log.error(`[manageInverterDevice] ${err}`);
				} else {
					if (obj) {
						obj.native.deviceModules = this.modulList; // modify object
						this.setForeignObject(obj._id, obj, (err) => {
							if (err) {
								this.log.error(`[manageInverterDevice] Error while DeviceListUpdate: ${err}`);
							} else {
								this.log.debug(`[manageInverterDevice] New Devicelist: ${JSON.stringify(this.modulList)}`);
							}
						});
						// config.clearModules reset
						if (this.config.clearModules) {
							this.config.clearModules = false;
							obj.native.clearModules = this.config.clearModules
							this.setForeignObject(obj._id, obj, (err) => {
								if (err) {
									this.log.error(`[manageInverterDevice] Error while resetting clearModules: ${err}`);
								} else {
									this.log.debug(`[manageInverterDevice] clearModules resettet`);
								}
							});
						}
					}
				}
			});
		}
	}

	/**
	* get inverter-id from api
	* @param {number} stationId Number of the station
	* returns deviceListItems
	*/
	async initializeInverter(stationId) {
		this.log.debug(`[initializeInverter] Station ID: ${stationId}`);
		return api.axios
			.post(
				'/station/v1.0/device?language=en', // language parameter does not show any effect
				{
					page: 1,
					size: 10,
					stationId: stationId
				}
			)
			.then((response) => {
				return (response.data.deviceListItems);
			})
			.catch((error) => {
				this.log.warn(`[initializeInverter] error: ${error.code}`);
				return Promise.reject(error);
			});
	}

	/**
	 * Get station id from api (multiple)
	 * @returns stationlist
	 */
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

	/**
	 * Is called when ApiClient has received new token.
	 * @param {*} token 
	 */
	async onTokenChanged(token) {
		this.log.debug('[onTokenChanged] token changed: ' + token);
		this.extendForeignObject('system.adapter.' + this.namespace, {
			native: {
				activeToken: token
			}
		});
	}

	/**
	* Check whether user data are plausible
	*/
	async checkUserData() {
		let inputData = this.config.email + this.config.password + this.config.appId + this.config.appSecret + this.config.companyName
		let crc = crypto5.createHash('md5').update(inputData).digest('hex');
		// get oldCRC		
		const object = await this.getStateAsync('checksumUserData');
		if (typeof (object) !== 'undefined' && object !== null) {
			this.oldCrc = object?.val;
		}
		this.log.debug(`[checkUserData] Crc ${this.oldCrc}`);
		// compare to previous config
		if (!this.oldCrc || this.oldCrc != crc) {
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
			this.getForeignObject('system.adapter.' + this.namespace, (err, obj) => {
				if (err) {
					this.log.error(`[checkUserData] ${err}`);
				} else {
					if (obj) {
						obj.native.activeToken = '';
						this.setForeignObject(obj._id, obj, (err) => {
							if (err) {
								this.log.error(`[checkUserData] Error while deleting token: ${err}`);
							} else {
								this.log.debug(`[checkUserData] Token deleted`);
							}
						});
					}
				}
			});
		}
		return
	}

	/**
	 * Deletes states
	 * @param {number} stationID 
	 * @param {number} deviceName 
	 * @param {*} stateName 
	 */
	async deleteDeviceState(stationID, deviceName, stateName) {
		const stateToDelete = stationID + '.' + deviceName + '.' + stateName;
		try {
			// Verify that associated object exists
			const currentObj = await this.getStateAsync(stateToDelete);
			if (currentObj) {
				await this.delObjectAsync(stateToDelete)
				this.log.debug(`[deleteDeviceState] Device ID: (${stateToDelete})`);
			} else {
				const currentState = await this.getStateAsync(stateName);
				if (currentState) {
					//await this.deleteStateAsync(deviceName);
					this.log.debug(`[deleteDeviceState] State: (${stateToDelete})`);
				}
			}
		} catch (e) {
			this.log.error(`[deleteDeviceState] error ${e} while deleting: (${stateToDelete})`);
		}
	}

	/**
	 * Deletes object or states (recursive)
	 * @param {number} stationId 
	 * @param {number} deviceId 
	 */
	async deleteDeviceObject(stationId, deviceId) {
		const deviceName = stationId + '.' + deviceId;
		try {
			// Verify that associated object exists
			const currentObj = await this.getObjectAsync(deviceName);
			if (currentObj) {
				await this.delObjectAsync(deviceName, { recursive: true });
				this.log.debug(`[deleteDeviceObject] Device ID: (${deviceName})`);
			} else {
				const currentState = await this.getStateAsync(deviceName);
				if (currentState) {
					await this.deleteStateAsync(deviceName);
					this.log.debug(`[deleteDeviceObject] State: (${deviceName})`);
				}
			}
		} catch (e) {
			this.log.error(`[deleteDeviceObject] error ${e} while deleting: (${deviceName})`);
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