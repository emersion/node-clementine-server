var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var ClementineServer = require('clementine-remote').Server;
var lame = require('lame');
var Speaker = require('speaker');
var Volume = require('pcm-volume');
var taglib = require('taglib');

var server = ClementineServer({
	port: 5500,
	auth_code: 42
});

var walk = function(dir, done) {
	var results = [];
	fs.readdir(dir, function(err, list) {
		if (err) return done(err);
		var pending = list.length;
		if (!pending) return done(null, results);
		list.forEach(function(file) {
			file = dir + '/' + file;
			fs.stat(file, function(err, stat) {
				if (stat && stat.isDirectory()) {
					walk(file, function(err, res) {
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

// See https://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search
var scan = function (dir, done) {
	var results = [];
	walk(dir, function(err, list) {
		if (err) return done(err);

		for (var i = 0; i < list.length; i++) {
			var path = list[i];
			
			if (path.substr(-4) != '.mp3') { // TODO: support other formats too
				continue;
			}
			results.push(path);
		}

		done(null, results);
	});
}

var playing = false, fileStream, lameStream, streamFormat, volumeStream, pcmWriter;

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

server.on('playpause', function () {
	if (fileStream) {
		if (playing) { // Pause
			volumeStream.unpipe(pcmWriter);

			stopSendingPosition();
			server.broadcast({
				type: 'PAUSE'
			});
		} else { // Play
			volumeStream.pipe(pcmWriter);

			startSendingPosition();
			server.broadcast({
				type: 'PLAY'
			});
		}
		playing = !playing;
		console.log('Playing:', playing);
		return;
	}
	playing = true;

	exec('xdg-user-dir MUSIC', function (err, stdout, stderr) {
		var musicDir = stdout.trim();
		if (err || stderr.trim()) {
			musicDir = process.env.HOME+'/Music';
		}

		scan(musicDir, function (err, results) {
			if (err) return console.error('ERR: could not read music directory', musicDir);

			var index = Math.ceil(Math.random() * results.length);
			var file = results[index];
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

				fileStream = fs.createReadStream(file);
				lameStream = fileStream.pipe(new lame.Decoder());
				lameStream.on('format', function (format) {
						console.log('Started playing file:', format);
						streamFormat = format;

						server.broadcast({
							type: 'ENGINE_STATE_CHANGED',
							response_engine_state_changed: { state: 'Playing' }
						});
						server.broadcast({
							type: 'PLAY'
						});

						position = 0;
						startSendingPosition();

						pcmWriter = new Speaker(format);
						volumeStream = new Volume();
						volumeStream.pipe(pcmWriter);
						this.pipe(volumeStream);
					})
					.on('end', function () {
						console.log('Finished.');
						playing = false;
						fileStream = null;
						lameStream = null;
						volumeStream = null;
						pcmWriter = null;

						stopSendingPosition();
						server.broadcast({
							type: 'STOP'
						});
						server.broadcast({
							type: 'ENGINE_STATE_CHANGED',
							response_engine_state_changed: { state: 'Idle' }
						});
					});
			});
		});
	});
});

server.on('volume', function (value) {
	if (value < 0 || value > 100) {
		return;
	}
	console.log('set volume', value / 100);
	if (volumeStream) {
		volumeStream.setVolume(value / 100);
		server.broadcast({
			type: 'SET_VOLUME',
			request_set_volume: { volume: value }
		});
	}
});