var fs = require('fs');
var events = require('events');
var util = require('util');
var path = require('path');
var exec = require('child_process').exec;
var MusicLibraryIndex = require('music-library-index');
var mm = require('musicmetadata');
var lame = require('lame');

// Try to load taglib module, ignore errors
var taglib;
try {
	taglib = require('taglibss');
} catch (e) {}

// @see https://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
var walk = function(dir, done) {
	var results = [];
	fs.readdir(dir, function (err, list) {
		if (err) return done(err);
		var pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function (file) {
			file = dir + '/' + file;
			fs.stat(file, function (err, stat) {
				if (stat && stat.isDirectory()) {
					walk(file, function (err, res) {
					results = results.concat(res);
					if (!--pending) done(null, results);
					});
				} else {
					results.push(file);
					if (!--pending) done(null, results);
				}
			});
		});
	});
};

function LocalLibrary(dirpath) {
	if (!(this instanceof LocalLibrary)) return new LocalLibrary(dirpath);
	events.EventEmitter.call(this);

	this.dirpath = dirpath;
}
util.inherits(LocalLibrary, events.EventEmitter);

LocalLibrary.prototype.scan = function (done) {
	var that = this;
	var operation = new events.EventEmitter();

	walk(this.dirpath, function (err, list) {
		if (err) return done(err);

		var completed = 0;

		//list = list.slice(0, 200); // TODO: optimizations

		var results = [];

		var processFile = function (file) {
			if (file.substr(-4) != '.mp3') { // TODO: support other formats too
				return fileProcessed();
			}

			var fileUrl = 'file://'+file;

			var gotMetadata = function (err, metadata) {
				if (!err) {
					metadata.key = fileUrl;
					metadata.name = metadata.name || path.basename(file, '.mp3');
					results.push(metadata);
				} else {
					//console.warn('WARN: could not parse track tags:', file, err);
				}

				fileProcessed();
			};

			if (taglib) {
				taglib.read(file, function (err, tag, audioProperties) {
					gotMetadata(err, {
						name: tag.title || '',
						artistName: tag.artist || '',
						albumName: tag.album || '',
						albumArtistName: tag.albumartist || '',
						year: tag.year || -1,
						genre: tag.genre || '',
						track: tag.track || -1,
						disk: tag.disk || -1,
						length: audioProperties.length
					});
				});
			} else { // Fallback to musicmetadata
				that.metadata(fileUrl, gotMetadata);
			}
		};
		var processNext = function () {
			operation.emit('progress', Math.round(completed / list.length * 100));

			var file = list[completed];
			processFile(file);
		};
		var fileProcessed = function () {
			completed++;
			if (completed == list.length) {
				process.stdout.write('\n');
				done(null, results);
			} else {
				processNext();
			}
		};

		processNext();
	});

	return operation;
};

LocalLibrary.prototype.supports = function (trackUrl) {
	return LocalLibrary.supports(trackUrl);
};
LocalLibrary.prototype.rawOpen = function (trackUrl) {
	var file = trackUrl.replace('file://', '');
	return fs.createReadStream(file);
};
LocalLibrary.prototype.open = function (trackUrl) {
	var stream = this.rawOpen(trackUrl);
	if (stream) {
		return stream.pipe(new lame.Decoder());
	}
};
LocalLibrary.prototype.metadata = function (trackUrl, done) {
	var stream = this.rawOpen(trackUrl);
	if (stream) {
		var parser = mm(stream);

		// listen for the metadata event
		var metadata = {};
		parser.on('metadata', function (result) {
			metadata = {
				name: result.title,
				artistName: result.artist.join(),
				albumName: result.album,
				albumArtistName: result.albumartist.join(),
				year: result.year,
				track: result.track && result.track.no,
				disk: result.disk && result.disk.no,
				genre: result.genre.join(),
				picture: result.picture[0],
				length: result.duration
			};
			for (var key in metadata) {
				if (!metadata[key]) {
					delete metadata[key];
				}
			}
		});
		parser.on('done', function (err) {
			done(err, metadata);
			stream.destroy();
		});
	}
};

LocalLibrary.defaultMusicDir = function (done) {
	exec('xdg-user-dir MUSIC', function (err, stdout, stderr) {
		var musicDir = stdout.trim();
		if (err || stderr.trim()) {
			musicDir = process.env.HOME+'/Music';
		}
		done(null, musicDir);
	});
};
LocalLibrary.supports = function (trackUrl) {
	return (trackUrl.indexOf('file://') == 0);
};
LocalLibrary.open = function (trackUrl) {
	var dirpath = trackUrl.replace('file://', '');
	return LocalLibrary(dirpath);
};

module.exports = LocalLibrary;