var ClementineServer = require('clementine-remote').Server;
var mdns = require('mdns');

var config = require('./config');
var Library = require('./lib/library');
var Player = require('./lib/player');
var Playlist = require('./lib/playlist');

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

Library.Local.defaultMusicDir(function (err, defaultDir) {
	var libConfigList = config.libraries || [];
	var libs = [];
	for (var i = 0; i < libConfigList.length; i++) {
		var libConfig = libConfigList[i];

		var lib;
		if (typeof libConfig == 'string') {
			lib = Library.open(libConfig);
		} else {
			switch (libConfig.type) {
				case 'local':
					lib = Library.Local(libConfig.dir || defaultDir);
					break;
			}
		}

		if (!lib) {
			console.warn('WARN: could not load library', libConfig);
		} else {
			libs.push(lib);
		}
	}

	var library = Library.Aggregator(libs);
	var playlist = Playlist(player, library);

	var formatTrackMetadata = function (track) {
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
		if (track.picture) {
			metadata.art = track.picture.data;
		}
		if (track.fileSize) {
			metadata.file_size = track.fileSize;
		}
		//TODO: pretty_length, rating
		return metadata;
	};

	player.on('open', function () {
		var track = playlist.currentTrack();
		library.metadata(track.key, function (err, metadata) {
			if (err) console.warn('WARN: could not read track metadata', err);
			server.song = formatTrackMetadata(metadata || track);
			console.log('Now playing:', server.song);
		});
	});

	playlist.on('update', function () {
		var tracks = playlist.listTracks();
		var list = [];
		for (var i = 0; i < tracks.length; i++) {
			list.push(formatTrackMetadata(tracks[i]));
		}
		server.playlist.setSongs(list);
	});

	var play = function (url) {
		// On play:
		//ACTIVE_PLAYLIST_CHANGED
		//CURRENT_METAINFO
		//PLAY
		//UPDATE_TRACK_POSITION
		//STOP

		playlist.addTrack(url);
		playlist.play();
	};

	library.scan(function (err) {
		if (err) return console.error('ERR: could not scan music library', err);

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

		server.on('next', function () {
			playlist.next();
		});
		server.on('previous', function () {
			playlist.previous();
		});

		server.on('insert_urls', function (req) {
			// TODO: playlists support
			console.log('insert_urls', req);

			for (var i = 0; i < req.urls.length; i++) {
				playlist.addTrack(req.urls[i]);
			}
			playlist.play();
		});

		playlist.on('end', function () {
			console.log('Playlist ended!');
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