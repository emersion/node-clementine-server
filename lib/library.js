var fs = require('fs');
var events = require('events');
var util = require('util');
var path = require('path');
var exec = require('child_process').exec;
var MusicLibraryIndex = require('music-library-index');
var taglib = require('taglib');

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

function Library(dirpath) {
	if (!(this instanceof Library)) return new Library(dirpath);
	events.EventEmitter.call(this);

	this.dirpath = dirpath;

	this.index = new MusicLibraryIndex();
}
util.inherits(Library, events.EventEmitter);

Library.prototype.scan = function (done) {
	var that = this;

	var results = [];
	walk(this.dirpath, function (err, list) {
		if (err) return done(err);

		var completed = 0;

		list = list.slice(0, 200); // TODO: optimizations

		list.forEach(function (file) {
			if (file.substr(-4) != '.mp3') { // TODO: support other formats too
				completed++;
				return;
			}

			taglib.tag(file, function (err, tag) {
				that.index.addTrack({
					key: file,
					name: tag.title || path.basename(file),
					artistName: tag.artist || '',
					albumName: tag.album || '',
					albumArtistName: tag.albumartist || '',
					year: tag.year || -1,
					genre: tag.genre || '',
					track: tag.track || -1,
					disk: tag.disk || -1
				});

				completed++;
				if (completed == list.length) {
					that.index.rebuild();
					done(null, that.index.trackTable);
				}
			});
		});
	});
};

Library.prototype.eachTrack = function (callback) {
	var that = this;
	var keys = Object.keys(this.index.trackTable);
	keys.forEach(function (key) {
		callback(that.index.trackTable[key], key);
	});
};

Library.prototype.randomTrack = function () {
	var keys = Object.keys(this.index.trackTable);
	var index = Math.ceil(Math.random() * keys.length);
	return this.index.trackTable[keys[index]];
};

Library.defaultMusicDir = function (done) {
	exec('xdg-user-dir MUSIC', function (err, stdout, stderr) {
		var musicDir = stdout.trim();
		if (err || stderr.trim()) {
			musicDir = process.env.HOME+'/Music';
		}
		done(null, musicDir);
	});
};

module.exports = Library;