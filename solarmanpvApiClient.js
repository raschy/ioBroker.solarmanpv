const events = require('events');
const axios = require('axios').default;
const crypto = require('crypto-js/sha256');

const wrapper = {
	axios: axios.create({
		baseURL: 'https://api.solarmanpv.com',
		timeout: 2000,
		headers: {
			'Content-Type': 'application/json',
		},
	}),
	maxGetToken : 1,
	token : String(null),
	email : String(null),
	password : String(null),
	appId : String(null),
	appSecret : String(null),
	eventEmitter : new events.EventEmitter()
};

wrapper.getToken = async function() {
	if(wrapper.maxGetToken < 1) return Promise.reject('could not retrieve token.');
	wrapper.maxGetToken--;

	// generate Hashwwert (sha256) from password
	const hash = crypto(wrapper.password).toString();

	return await wrapper.axios
		.post('/account/v1.0/token?appId=' + wrapper.appId + '&language=en', {
			appSecret: wrapper.appSecret,
			email: wrapper.email,
			password: hash,
		})
		.then((response) => {
			console.log(`[getToken] debug: ${response.data.access_token}`);
			wrapper.token = response.data.access_token;
			wrapper.eventEmitter.emit('tokenChanged', wrapper.token);
		})
		.catch(function (error) {
			console.log (`[getToken] error: ${error}`);
		});
};

wrapper.axios.interceptors.request.use((config) => {
	console.log('RequestURL',config.url);

	if(config.url && config.url.substring(0,19) == '/account/v1.0/token')
	{
		console.log('TokenUrlFound');
		if (config.headers && config.headers['Authorization'])
			delete config.headers['Authorization'];
		return config;
	}

	if (config.headers)
		config.headers['Authorization'] = 'bearer ' + wrapper.token;
	return config;
});

wrapper.axios.interceptors.response.use(async (response) => {

	if(response.data.msg){
		console.log('==== interceptor ====');
		console.log(response.data.msg);

		if(response.data.msg === 'auth token not found' || response.data.msg === 'auth invalid token' ) {
			console.log('trying to get new token');

			return await wrapper.getToken()
				.then(async () => {
					return await wrapper.axios.request(response.config);
				})
				.catch(function (error) {
					return Promise.reject(error);
				});
		}

		return Promise.reject(response.data.msg);
	}

	return response;

}, function (error) {
	return Promise.reject(error);
});

module.exports = wrapper;