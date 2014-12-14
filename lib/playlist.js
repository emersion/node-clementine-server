var events = require('events');
var util = require('util');

// @see https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
function shuffle(array) {
	var counter = array.length, temp, index;

	// While there are elements in the array
	while (counter > 0) {
		// Pick a random index
		index = Math.floor(Math.random() * counter);

		// Decrease counter by 1
		counter--;

		// And swap the last element with it
		temp = array[counter];
		array[counter] = array[index];
		array[index] = temp;
	}

	return array;
}

function Playlist(player, library) {
	if (!(this instanceof Playlist)) return new Playlist(player, library);
	events.EventEmitter.call(this);

	var that = this;

	this.library = library;
	this.player = player;

	this.queue = [];
	this.current = null;

	this.repeat = 'Off';

	var shuffle = 'Off', originalQueue;
	Object.defineProperty(this, 'shuffle', {
		get: function () {
			return shuffle;
		},
		set: function (value) {
			if (shuffle == value) {
				return;
			}
			if (shuffle == 'Off') {
				originalQueue = that.queue;
			}

			if (value == 'All') {
				this.queue = shuffle(this.queue.slice(0));
			} else {
				that.queue = originalQueue;
			}
		}
	});

	player.on('end', function () {
		that.next();
	});
}
util.inherits(Playlist, events.EventEmitter);

Playlist.prototype.currentTrack = function () {
	return this.library.getTrack(this.queue[this.current]);
};
Playlist.prototype.listTracks = function () {
	var list = [];
	for (var i = 0; i < this.queue.length; i++) {
		var url = this.queue[i];
		list.push(this.library.getTrack(url));
	}
	return list;
};
Playlist.prototype.addTrack = function (key) {
	this.queue.push(key);
	this.emit('update');
};
Playlist.prototype.removeTrack = function (key) {
	var index = this.queue.indexOf(key);
	if (index >= 0) {
		this.queue = this.queue.slice(index, 1);
		this.emit('update');
	}
};
Playlist.prototype.open = function (url) {
	console.log('Open', url);
	var stream = this.library.open(url);
	if (stream) {
		this.player.open(stream);
		this.player.play();
	} else {
		console.warn('WARN: could not open file: ', url);
	}
};
Playlist.prototype.play = function () {
	if (this.player.opened) {
		return;
	}

	this.emit('play');
	this.next();
};
Playlist.prototype.end = function () {
	if (this.player.opened) {
		this.player.stop();
	}

	this.emit('end');
};
Playlist.prototype.stop = function () {
	this.current = null;

	this.player.stop();

	this.emit('stop');
};
Playlist.prototype.next = function () {
	if (this.queue.length == 0) {
		this.end();
		return;
	}

	if (this.repeat != 'Track') {
		if (this.current === null) {
			this.current = 0;
		} else {
			var next = this.current + 1;
			if (next >= this.queue.length) {
				if (this.repeat == 'Playlist') {
					this.current = 0;
				} else {
					this.end();
					return;
				}
			} else {
				this.current = next;
			}
		}
	}

	this.open(this.queue[this.current]);
};
Playlist.prototype.previous = function () {
	//TODO
};

module.exports = Playlist;