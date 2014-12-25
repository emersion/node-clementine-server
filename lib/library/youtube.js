var url = require('url');
var path = require('path');
var util = require('util');
var Youtube = require('youtube-api');
var ytdl = require('ytdl-core');
var request = require('request');
var ffmpeg = require('fluent-ffmpeg');

Youtube.authenticate({
	type: 'key',
	key: 'AIzaSyDHw3Gx1hheYHaGt343VIIVlpWH_iAZTtE'
});

function parseISO8601Duration(dur) {
	var match = /^PT([0-9]+)M([0-9]+)S$/.exec(dur);
	return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function YoutubeLibrary() {}

YoutubeLibrary.prototype.open = function (trackUrl) {
	var dl = ytdl(trackUrl, {
		filter: function(format) { return format.container === 'mp4'; }
	});
	var stream = ffmpeg(dl).noVideo().format('s16le').audioCodec('pcm_s16le');
	process.nextTick(function () {
		stream.emit('format', { channels: 2, bitDepth: 16, sampleRate: 44100 });
	});
	return stream;
};
YoutubeLibrary.prototype._formatMetadata = function (it) {
	var url = 'https://www.youtube.com/watch?v=';
	if (it.kind == 'youtube#searchResult') {
		url += it.id.videoId;
	} else if (it.kind == 'youtube#playlistItem') {
		url += it.snippet.resourceId.videoId;
	} else if (it.kind == 'youtube#video') {
		url += it.id;
	}
	var metadata = {
		key: url,
		name: it.snippet.title,
		artistName: it.snippet.channelTitle,
		year: (new Date(it.snippet.publishedAt)).getFullYear()
	};
	if (it.kind == 'youtube#playlistItem') {
		metadata.track = it.snippet.position;
	}
	if (it.contentDetails) {
		metadata.length = parseISO8601Duration(it.contentDetails.duration);
	}
	return metadata;
};
YoutubeLibrary.prototype.metadata = function (trackUrl, done) {
	var that = this;

	var query = url.parse(trackUrl, true).query;
	if (!query.v) {
		return process.nextTick(function () {
			done('Not a Youtube URL: '+trackUrl);
		});
	}

	Youtube.videos.list({
		part: 'snippet,contentDetails',
		id: query.v
	}, function (err, data) {
		if (err) return done(err);

		var item = data.items[0];
		var metadata = that._formatMetadata(item);

		// Retrieve picture (sizes: default, thumbnail, high, standard, maxres)
		var pictureUrl = item.snippet.thumbnails.high.url;
		request({
			url: pictureUrl,
			encoding: null // Return body as a Buffer
		}, function (err, res, body) {
			if (err) console.log('WARN: could not send Youtube video thumbnail request', err);
			if (res.statusCode == 200) {
				metadata.picture = {
					type: 'png',
					data: body
				};
			} else {
				console.log('WARN: could not get Youtube video thumbnail', body.toString());
			}
			done(null, metadata);
		});
	});
};
YoutubeLibrary.prototype.supports = function (trackUrl) {
	return module.exports.supports(trackUrl);
};


function YoutubeChannelLibrary(channelId) {
	if (!(this instanceof YoutubeChannelLibrary)) return new YoutubeChannelLibrary(channelId);
	
	YoutubeLibrary.call(this);

	this.id = channelId;
	this.snippet = null;
}
util.inherits(YoutubeChannelLibrary, YoutubeLibrary);

YoutubeChannelLibrary.prototype.scan = function (done) {
	var that = this;
	Youtube.search.list({
		part: 'snippet',
		channelId: this.id,
		maxResults: 50,
		order: 'title',
		type: 'video'
	}, function (err, data) {
		if (err) return done(err);

		var items = data.items;
		var results = [];
		for (var i = 0; i < items.length; i++) {
			var it = items[i];

			var metadata = that._formatMetadata(it);
			if (that.snippet) {
				metadata.artistName = that.snippet.title;
			}
			results.push(metadata);
		}
		done(null, results);
	});
};


function YoutubeUserLibrary(username) {
	if (!(this instanceof YoutubeUserLibrary)) return new YoutubeUserLibrary(username);
	
	YoutubeChannelLibrary.call(this);

	this.username = username;
}
util.inherits(YoutubeUserLibrary, YoutubeChannelLibrary);

YoutubeUserLibrary.prototype._getChannelId = function (done) {
	var that = this;
	Youtube.channels.list({
		part: 'snippet',
		forUsername: this.username
	}, function (err, data) {
		if (err) return done(err);

		var item = data.items[0];
		that.id = item.id;
		that.snippet = item.snippet;
		done();
	});
};
YoutubeUserLibrary.prototype.scan = function (done) {
	var that = this;
	this._getChannelId(function (err) {
		if (err) return done(err);
		YoutubeChannelLibrary.prototype.scan.call(that, done);
	});
};


function YoutubePlaylistLibrary(playlistId) {
	if (!(this instanceof YoutubePlaylistLibrary)) return new YoutubePlaylistLibrary(playlistId);
	
	YoutubeLibrary.call(this);

	this.id = playlistId;
	this.snippet = null;
}
util.inherits(YoutubePlaylistLibrary, YoutubeLibrary);

YoutubePlaylistLibrary.prototype._getSnippet = function (done) {
	var that = this;
	Youtube.playlists.list({
		part: 'snippet',
		id: this.id
	}, function (err, data) {
		if (err) return done(err);

		var item = data.items[0];
		that.snippet = item.snippet;
		done();
	});
};
YoutubePlaylistLibrary.prototype.scan = function (done) {
	var that = this;
	this._getSnippet(function (err) {
		if (err) return done(err);

		Youtube.playlistItems.list({
			part: 'snippet',
			playlistId: that.id,
			maxResults: 50
		}, function (err, data) {
			if (err) return done(err);

			var items = data.items;
			var results = [];
			for (var i = 0; i < items.length; i++) {
				var it = items[i];

				var metadata = that._formatMetadata(it);
				if (that.snippet) {
					metadata.artistName = that.snippet.channelTitle;
					metadata.albumName = that.snippet.title;
				}
				results.push(metadata);
			}
			done(null, results);
		});
	});
};

module.exports = {
	Channel: YoutubeChannelLibrary,
	User: YoutubeUserLibrary,
	Playlist: YoutubePlaylistLibrary,
	supports: function (ytUrl) {
		var host = url.parse(ytUrl).host;
		return (['youtube.com', 'www.youtube.com'/*, 'youtu.be'*/].indexOf(host) >= 0);
	},
	open: function (ytUrl) {
		var channelPath = url.parse(ytUrl).pathname.split('/');

		switch (channelPath[1]) {
			case 'channel':
				return YoutubeChannelLibrary(channelPath[2]);
			case 'user':
				return YoutubeUserLibrary(channelPath[2]);
			case 'playlist':
				return YoutubePlaylistLibrary(url.parse(ytUrl, true).query.list);
		}
	}
};