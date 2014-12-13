var MusicLibraryIndex = require('music-library-index');
var extend = require('extend');

function Aggregator(libraries) {
	if (!(this instanceof Aggregator)) return new Aggregator(libraries);

	this.slave = false;
	this.libraries = libraries || [];
	this.index = new MusicLibraryIndex();
}
Aggregator.prototype.addLibrary = function (library) {
	library.slave = true;
	this.libraries.push(library);
};
Aggregator.prototype.removeLibrary = function (library) {
	var i = this.libraries.indexOf(library);
	this.libraries = this.libraries.slice(i, 1);
};
Aggregator.prototype.addTrack = function (track, libraryIndex) {
	if (!track.key) {
		return false;
	}
	track = extend({
		key: '',
		name: '',
		artistName: '',
		albumName: '',
		albumArtistName: '',
		year: -1,
		genre: '',
		track: -1,
		disk: -1
	}, track, {
		library: libraryIndex
	});
	this.index.addTrack(track);
};
Aggregator.prototype.scan = function (done) {
	var that = this;

	var completed = 0;
	this.libraries.forEach(function (library, libraryIndex) {
		library.scan(function (err, results) {
			if (err) {
				console.warn('WARN: could not scan library #'+libraryIndex, library);
			} else {
				for (var i = 0; i < results.length; i++) {
					that.addTrack(results[i], libraryIndex);
				}
			}

			completed++;
			console.log('Loaded library '+completed+'/'+that.libraries.length);
			if (completed == that.libraries.length) {
				that.index.rebuild();
				console.log('Libraries loaded.');
				done(null); //TODO: provide trackTable as an array
			}
		});
	});
};

Aggregator.prototype.getTrack = function (key) {
	return this.index.trackTable[key];
};
Aggregator.prototype.eachTrack = function (callback) {
	var that = this;
	var keys = Object.keys(this.index.trackTable);
	keys.forEach(function (key) {
		callback(that.index.trackTable[key], key);
	});
};

Aggregator.prototype.randomTrack = function () {
	var keys = Object.keys(this.index.trackTable);
	var index = Math.ceil(Math.random() * keys.length);
	return this.index.trackTable[keys[index]];
};

Aggregator.prototype._libraryForTrack = function (trackUrl) {
	for (var i = 0; i < this.libraries.length; i++) {
		if (this.libraries[i].supports(trackUrl)) {
			return this.libraries[i];
		}
	}
};
Aggregator.prototype.supports = function (trackUrl) {
	return (this._libraryForTrack(trackUrl)) ? true : false;
};
Aggregator.prototype.open = function (trackUrl) {
	var lib = this._libraryForTrack(trackUrl);
	if (lib) {
		return lib.open(trackUrl);
	}
	return null;
};
Aggregator.prototype.metadata = function (trackUrl, done) {
	var track = this.getTrack(trackUrl);
	var lib = this._libraryForTrack(trackUrl);
	if (lib && typeof lib.metadata == 'function') {
		return lib.metadata(trackUrl, function (err, additionalData) {
			if (err) return done(err);
			track = extend({}, track, additionalData);
			done(null, track);
		});
	} else {
		process.nextTick(function () {
			if (track) {
				done(null, track);
			} else {
				done('Cannot find track '+trackUrl);
			}
		});
	}
};

module.exports = Aggregator;