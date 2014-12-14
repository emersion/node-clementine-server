var events = require('events');
var util = require('util');
var Speaker = require('speaker');
var Volume = require('pcm-volume');

function Player() {
	if (!(this instanceof Player)) return new Player();
	events.EventEmitter.call(this);

	this.opened = false;
	this.playing = false;
	this.pcmStream = null;
	this.volumeStream = null;
	this.pcmWriter = null;

	this.volume = 1;
}
util.inherits(Player, events.EventEmitter);

Player.prototype.open = function (stream) {
	var that = this;

	if (this.opened) {
		this.stop();
	}

	this.opened = true;
	this.pcmStream = stream;

	stream.on('format', function (format) {
		that.pcmWriter = new Speaker(format);
		that.pcmWriter.on('error', function (err) {
			console.warn('WARN: Speaker error:', err);
		});
		that.emit('open');
	});
	stream.on('end', function () {
		that.stop();
		that.emit('end');
	});
	stream.on('error', function (err) {
		console.warn('WARN: PCM stream error:', err);
	});
};
Player.prototype.play = function () {
	var that = this;

	if (this.playing) {
		return;
	}

	if (!this.pcmWriter) {
		this.once('open', function () {
			that.play();
		});
		return;
	}
	if (this.volumeStream) {
		this.volumeStream.pipe(this.pcmWriter);
	} else {
		this.volumeStream = new Volume();

		this.volumeStream.pipe(this.pcmWriter);
		this.pcmStream.pipe(this.volumeStream);
	}

	this.playing = true;
	this.emit('play');
};
Player.prototype.pause = function () {
	if (!this.playing) {
		return;
	}

	this.volumeStream.unpipe(this.pcmWriter);

	this.playing = false;
	this.emit('pause');
};
Player.prototype.playpause = function () {
	if (this.playing) {
		this.pause();
	} else {
		this.play();
	}
};
Player.prototype.stop = function () {
	if (this.pcmStream.end) { // lame, fs
		this.pcmStream.end();
	} else if (this.pcmStream.kill) { // ffmpeg
		try { // TODO: wait for PR to be merged: https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/pull/347
			this.pcmStream.kill();
		} catch (e) {}
	}
	this.volumeStream.end();
	this.pcmWriter.close();

	this.opened = false;
	this.playing = false;
	this.pcmStream = null;
	this.volumeStream = null;
	this.pcmWriter = null;

	this.emit('stop');
};
Player.prototype.setVolume = function (value) {
	if (value < 0 || value > 1) {
		return;
	}

	this.volumeStream.setVolume(value);
	this.emit('volume', value);
};

module.exports = Player;