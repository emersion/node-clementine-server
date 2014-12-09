var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var ClementineServer = require('clementine-remote').Server;
var lame = require('lame');
var Speaker = require('speaker');
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

var playing = false;
server.on('playpause', function () {
	if (playing) {
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
			taglib.tag(file, function (err, tag) {
				if (err) console.error('WARN: error while reading song tags', err);

				console.log('Now playing:', file, tag);

				// TODO: title from basename
				var metadata = {
					id: 0,
					index: 0,
					title: tag.title || path.basename(file),
					filename: path.basename(file), //TODO: absolute path? Relative to music dir
					is_local: true
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
				//TODO: pretty_length, art, length, file_size, rating
				server.broadcast({
					type: 'CURRENT_METAINFO',
					response_current_metadata: {
						song_metadata: metadata
					}
				});

				fs.createReadStream(file)
					.pipe(new lame.Decoder())
					.on('format', function (format) {
						console.log('Started', format);

						server.broadcast({
							type: 'ENGINE_STATE_CHANGED',
							response_engine_state_changed: { state: 'Playing' }
						});

						this.pipe(new Speaker(format));
					})
					.on('end', function () {
						console.log('Finished.');
						playing = false;

						server.broadcast({
							type: 'ENGINE_STATE_CHANGED',
							response_engine_state_changed: { state: 'Idle' }
						});
					});
			});
		});
	});
});
