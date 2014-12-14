var url = require('url');
var path = require('path');
var Soundcloud = require('soundcloud-api');
var youtubedl = require('youtube-dl');
var request = require('request');
var lame = require('lame');

var soundcloud = new Soundcloud({
	client_id: '30342a1b027c84e1aad5571aa43fbc36'
});
var client = soundcloud.client();

function SoundcloudUserLibrary(userId) {
	if (!(this instanceof SoundcloudUserLibrary)) return new SoundcloudUserLibrary(userId);
	this.id = userId;
}
SoundcloudUserLibrary.prototype._formatMetadata = function (track) {
	var metadata = {
		key: track.uri,
		name: track.title,
		artistName: track.user.username,
		year: track.release_year,
		genre: track.genre,
		length: Math.round(track.duration / 1000)
	};
	return metadata;
};
SoundcloudUserLibrary.prototype.scan = function (done) {
	var that = this;

	client.get('/users/'+this.id+'/tracks', function (err, data) {
		if (err) return done(err);

		var tracks = JSON.parse(data);
		var results = [];
		for (var i = 0; i < tracks.length; i++) {
			results.push(that._formatMetadata(tracks[i]));
		}
		done(null, results);
	});
};

SoundcloudUserLibrary.prototype.supports = function (trackUrl) {
	return SoundcloudUserLibrary.supports(trackUrl);
};
SoundcloudUserLibrary.prototype.open = function (trackUrl) {
	var dl = youtubedl(trackUrl, [], {});
	return dl.pipe(new lame.Decoder());
};
SoundcloudUserLibrary.prototype.metadata = function (trackUrl, done) {
	var that = this;
	var trackPath = url.parse(trackUrl).path;

	client.get(trackPath, function (err, data) {
		if (err) return done(err);

		var track = JSON.parse(data);
		var metadata = that._formatMetadata(track);
		request({
			url: track.artwork_url.replace('large', 'crop'),
			encoding: null // Return body as a Buffer
		}, function (err, res, body) {
			if (err) console.log('WARN: could not send Soundcloud artwork request', err);
			if (res.statusCode == 200) {
				metadata.picture = {
					type: 'jpg',
					data: body
				};
			} else {
				console.log('WARN: could not get Soundcloud artwork', body.toString());
			}
			done(null, metadata);
		});
	});
};

SoundcloudUserLibrary.supports = function (scUrl) {
	var host = url.parse(scUrl).host;
	return (['soundcloud.com', 'www.soundcloud.com', 'api.soundcloud.com'].indexOf(host) >= 0);
};
SoundcloudUserLibrary.open = function (userUrl) {
	var userPath = url.parse(userUrl).path;
	var userId = path.basename(userPath);
	return SoundcloudUserLibrary(userId);
};

module.exports = {
	User: SoundcloudUserLibrary,
	supports: SoundcloudUserLibrary.supports,
	open: SoundcloudUserLibrary.open
};