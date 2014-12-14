var libs = {
	list: ['Local', 'Youtube', 'Soundcloud'],
	Aggregator: require('./aggregator')
};

for (var i = 0; i < libs.list.length; i++) {
	var libName = libs.list[i];
	libs[libName] = require('./'+libName.toLowerCase());
}

libs.open = function (url) {
	for (var i = 0; i < libs.list.length; i++) {
		var lib = libs[libs.list[i]];
		if (lib.supports(url)) {
			return lib.open(url);
		}
	}
};

module.exports = libs;