var fs = require('fs');
var exec = require('child_process').exec;
var lame = require('lame');
var Speaker = require('speaker');
var taglib = require('taglib');

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
			
			if (path.substr(-4) != '.mp3') {
				continue;
			}
			results.push(path);
		}

		done(null, results);
	});
}

exec('xdg-user-dir MUSIC', function (err, stdout, stderr) {
	var musicDir = stdout.trim();
	if (err || stderr.trim()) {
		musicDir = process.env.HOME+'/Music';
	}

	scan(musicDir, function (err, results) {
		if (err) return console.error('ERR: could not read music directory', musicDir);

		var index = Math.ceil(Math.random() * results.length);
		var path = results[index];
		taglib.tag(path, function (err, tag) {
			if (err) console.error('WARN: error while reading song tags', err);

			console.log('Now playing:', path, tag);

			fs.createReadStream(path)
				.pipe(new lame.Decoder())
				.on('format', function (format) {
					this.pipe(new Speaker(format));
				})
				.on('end', function () {
					console.log('Finished.');
					process.exit();
				});
		});
	});
});
