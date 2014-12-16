var url = require('url');
var path = require('path');
var querystring = require('querystring');
var request = require('request');
var lame = require('lame');

function Jamendo(opts) {
	if (!(this instanceof Jamendo)) return new Jamendo(opts);
	this.options = opts;

	this.basepath = 'https://api.jamendo.com/v3.0/';
}
Jamendo.prototype.get = function (path, params, done) {
	params = params || {};
	params['client_id'] = this.options.client_id;
	params['format'] = 'jsonpretty';

	if (path[0] == '/') {
		path = path.substr(1);
	}

	var target = url.resolve(this.basepath, path);
	target += '?'+querystring.stringify(params);

	return request(target, function (err, data) {
		if (err) return done(err);
		done(null, JSON.parse(data.body));
	});
};

var client = Jamendo({
	client_id: 'a42fbc93'
});

function JamendoArtistLibrary(artistName) {
	if (!(this instanceof JamendoArtistLibrary)) return new JamendoArtistLibrary(artistName);
	this.name = artistName;
}
JamendoArtistLibrary.prototype._formatMetadata = function (track) {
	var metadata = {
		key: track.shareurl || 'https://www.jamendo.com/track/'+track.id,
		name: track.name,
		artistName: track.artist_name,
		albumName: track.album_name,
		year: parseInt(track.releasedate.split('-')[0], 10),
		length: parseInt(track.duration, 10)
	};
	if (track.musicinfo) {
		metadata.genre = track.musicinfo.tags.genres.join();
	}
	return metadata;
};
JamendoArtistLibrary.prototype.scan = function (done) {
	var that = this;

	client.get('/artists/tracks', {
		name: this.name,
		order: 'track_name',
		audioformat: 'mp32'
	}, function (err, data) {
		if (err) return done(err);

		var artistName = data.results[0].name;

		var results = [];
		for (var i = 0; i < data.results[0].tracks.length; i++) {
			var track = data.results[0].tracks[i];
			track.artist_name = artistName;
			results.push(that._formatMetadata(track));
		}
		done(null, results);
	});
};

JamendoArtistLibrary.prototype.supports = function (trackUrl) {
	return JamendoArtistLibrary.supports(trackUrl);
};
JamendoArtistLibrary.prototype.open = function (trackUrl) {
	var trackId = JamendoArtistLibrary._parseTrackUrl(trackUrl);
	// TODO: use URL from API response
	return request('https://storage-new.newjamendo.com?trackid='+trackId+'&format=mp32&from=app-devsite').pipe(new lame.Decoder());
};
JamendoArtistLibrary.prototype.metadata = function (trackUrl, done) {
	var that = this;
	var trackId = JamendoArtistLibrary._parseTrackUrl(trackUrl);

	client.get('/tracks', {
		id: trackId,
		limit: 1,
		audioformat: 'mp32'
	}, function (err, data) {
		if (err) return done(err);

		var track = data.results[0];
		var metadata = that._formatMetadata(track);
		request({
			url: track.album_image,
			encoding: null // Return body as a Buffer
		}, function (err, res, body) {
			if (err) console.log('WARN: could not send Jamendo album image request', err);
			if (res.statusCode == 200) {
				metadata.picture = {
					type: 'jpg',
					data: body
				};
			} else {
				console.log('WARN: could not get Jamendo album image', body.toString());
			}
			done(null, metadata);
		});
	});
};

JamendoArtistLibrary._parseTrackUrl = function (trackUrl) {
	var trackPath = url.parse(trackUrl).path;
	return path.basename(trackPath);
};
JamendoArtistLibrary._parseArtistUrl = function (artistUrl) {
	var artistPath = url.parse(artistUrl).path;
	return path.basename(artistPath);
};

JamendoArtistLibrary.supports = function (jamendoUrl) {
	var host = url.parse(jamendoUrl).host;
	return (['jamendo.com', 'www.jamendo.com', 'api.jamendo.com'].indexOf(host) >= 0);
};
JamendoArtistLibrary.open = function (artistUrl) {
	var artistName = JamendoArtistLibrary._parseArtistUrl(artistUrl);
	return JamendoArtistLibrary(artistName);
};

module.exports = {
	Artist: JamendoArtistLibrary,
	supports: JamendoArtistLibrary.supports,
	open: JamendoArtistLibrary.open
};