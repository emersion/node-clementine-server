var fs = require('fs');
var path = require('path');
var ClementineServer = require('clementine-remote').Server;
var lame = require('lame');
var Speaker = require('speaker');
var Volume = require('pcm-volume');
var taglib = require('taglib');

var Library = require('./lib/library');
var Player = require('./lib/player');

var position = 0, positionInterval;
var startSendingPosition = function () {
	positionInterval = setInterval(function () {
		server.broadcast({
			type: 'UPDATE_TRACK_POSITION',
			response_update_track_position: { position: position }
		});
		position++;
	}, 1000);
};
var stopSendingPosition = function () {
	clearInterval(positionInterval);
};

var server = ClementineServer({
	port: 5500,
	auth_code: 42
});

var player = Player();

player.on('play', function () {
	server.broadcast({
		type: 'PLAY'
	});
	startSendingPosition();
});
player.on('pause', function () {
	server.broadcast({
		type: 'PAUSE'
	});
	stopSendingPosition();
});
player.on('stop', function () {
	server.broadcast({
		type: 'STOP'
	});
	stopSendingPosition();
});
player.on('volume', function (value) {
	server.broadcast({
		type: 'SET_VOLUME',
		request_set_volume: { volume: value * 100 }
	});
});

Library.defaultMusicDir(function (err, dirpath) {
	console.log('Music dir:', dirpath);
	var library = Library(dirpath);

	library.scan(function (err, results) {
		if (err) return console.error('ERR: could not scan music directory', err);
		console.log('Library loaded.');

		server.on('playpause', function () {
			if (!player.opened) {
				var index = Math.ceil(Math.random() * results.length);
				var file = results[index];

				var track = library.randomTrack();
				var file = track.key;
				taglib.read(file, function (err, tag, audioProperties) {
					if (err) console.error('WARN: error while reading song tags', err);

					console.log('Now playing:', file, tag, audioProperties);

					// On new client:
					//INFO
					//CURRENT_METAINFO
					//SET_VOLUME
					//UPDATE_TRACK_POSITION
					//PLAYLISTS
					//PLAYLIST_SONGS
					//REPEAT
					//SHUFFLE
					//FIRST_DATA_SENT_COMPLETE

					// On play:
					//ACTIVE_PLAYLIST_CHANGED
					//CURRENT_METAINFO
					//PLAY
					//UPDATE_TRACK_POSITION
					//STOP
					
					var metadata = {
						id: 0,
						index: 0,
						title: tag.title || path.basename(file),
						filename: path.basename(file), //TODO: absolute path? Relative to music dir
						is_local: true,
						length: audioProperties.length
					};
					var props = ['album', 'artist', 'albumartist', 'track', 'disc', 'genre'];
					for (var i = 0; i < props.length; i++) {
						var name = props[i];
						if (tag[name]) {
							metadata[name] = tag[name];
						}
					}
					if (tag.year) {
						metadata.pretty_year = String(tag.year);
					}
					//TODO: pretty_length, art, file_size, rating
					server.broadcast({
						type: 'CURRENT_METAINFO',
						response_current_metadata: {
							song_metadata: metadata
						}
					});

					var stream = fs.createReadStream(file).pipe(new lame.Decoder());
					player.open(stream);
					player.play();
				});
			} else {
				player.playpause();
			}
		});
	});
});

server.on('volume', function (value) {
	if (value < 0 || value > 100) {
		return;
	}

	console.log('set volume', value / 100);
	player.setVolume(value / 100);
});