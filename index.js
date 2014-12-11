var fs = require('fs');
var path = require('path');
var ClementineServer = require('clementine-remote').Server;
var lame = require('lame');
var Speaker = require('speaker');
var Volume = require('pcm-volume');
var taglib = require('taglib');
var mdns = require('mdns');

var Library = require('./lib/library');
var Player = require('./lib/player');

var position = 0, positionInterval;
var startSendingPosition = function () {
	positionInterval = setInterval(function () {
		server.position = position;
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
	server.play();
	startSendingPosition();
});
player.on('pause', function () {
	server.pause();
	stopSendingPosition();
});
player.on('stop', function () {
	server.stop();
	stopSendingPosition();
	position = 0;
});
player.on('volume', function (value) {
	server.volume = value * 100;
});

Library.Local.defaultMusicDir(function (err, dirpath) {
	console.log('Music dir:', dirpath);

	var localLib = Library.Local(dirpath);
	var ytLib = Library.Youtube.Channel('UCyC_4jvPzLiSkJkLIkA7B8g');
	var library = Library.Aggregator([localLib, ytLib]);

	var play = function (url) {
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

		var track = library.getTrack(url);
		var metadata = {
			id: 0,
			index: 0,
			title: track.name,
			is_local: true
		};
		var props = ['track', 'disc', 'genre'];
		for (var i = 0; i < props.length; i++) {
			var name = props[i];
			if (track[name]) {
				metadata[name] = track[name];
			}
		}
		if (track.artistName) {
			metadata.artist = track.artistName;
		}
		if (track.albumName) {
			metadata.album = track.albumName;
		}
		if (track.albumArtistName) {
			metadata.albumartist = track.albumArtistName;
		}
		if (track.length) {
			metadata.length = track.length;
		}
		if (track.year > 0) {
			metadata.pretty_year = String(track.year);
		}
		//TODO: pretty_length, art, file_size, rating
		server.song = metadata;

		console.log('Now playing:', metadata);

		var stream = library.open(url);
		player.open(stream);
		player.play();
	};

	library.scan(function (err) {
		if (err) return console.error('ERR: could not scan music directory', err);

		library.eachTrack(function (track, key) {
			// TODO: wait for the DB to be ready
			// TODO: add more info
			server.library.addSong({
				title: track.name,
				album: track.albumName,
				artist: track.artistName,
				filename: track.key
			});
		});

		var playRandom = function () {
			var track = library.randomTrack();
			play(track.key);
		};

		server.on('playpause', function () {
			if (!player.opened) {
				playRandom();
			} else {
				player.playpause();
			}
		});

		server.on('insert_urls', function (req) {
			// TODO: playlists support
			console.log('insert_urls', req);

			var file = req.urls[0];
			play(file);
		});

		player.on('end', function () {
			playRandom();
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

server.on('connection', function (conn) {
	// TODO: these functions will be integrated in clementine-remote module directly
	/*conn.on('request_playlists', function () {});*/
});

server.on('listening', function () {
	var ad = mdns.createAdvertisement(mdns.tcp('clementine'), server.address().port, {
		domain: 'local'
	}, function (err, opts) {
		if (err) return console.warn('WARN: could not start MDNS service', err);
		console.log('MDNS service started.');
	});
	ad.start();
});