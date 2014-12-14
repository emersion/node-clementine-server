var url = require('url');
var path = require('path');
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

function YoutubeChannelLibrary(channelId) {
	if (!(this instanceof YoutubeChannelLibrary)) return new YoutubeChannelLibrary(channelId);
	this.id = channelId;
}
YoutubeChannelLibrary.prototype.scan = function (done) {
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
			var url = 'https://www.youtube.com/watch?v='+it.id.videoId;
			var metadata = {
				key: url,
				name: it.snippet.title,
				artistName: it.snippet.channelTitle,
				year: (new Date(it.snippet.publishedAt)).getFullYear()
			};
			results.push(metadata);
		}
		done(null, results);
	});
};

YoutubeChannelLibrary.prototype.supports = function (trackUrl) {
	return YoutubeChannelLibrary.supports(trackUrl);
};
YoutubeChannelLibrary.prototype.open = function (trackUrl) {
	var dl = ytdl(trackUrl, {
		filter: function(format) { return format.container === 'mp4'; }
	});
	var stream = ffmpeg(dl).noVideo().format('s16le').audioCodec('pcm_s16le');
	process.nextTick(function () {
		stream.emit('format', { channels: 2, bitDepth: 16, sampleRate: 44100 });
	});
	return stream;
};
YoutubeChannelLibrary.prototype.metadata = function (trackUrl, done) {
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
		var metadata = {
			name: item.snippet.title,
			artistName: item.snippet.channelTitle,
			year: (new Date(item.snippet.publishedAt)).getFullYear(),
			length: parseISO8601Duration(item.contentDetails.duration)
		};

		// Retrieve picture
		var pictureUrl;
		for (var key in item.snippet.thumbnails) {
			pictureUrl = item.snippet.thumbnails[key].url;
			break;
		}
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

YoutubeChannelLibrary.supports = function (ytUrl) {
	var host = url.parse(ytUrl).host;
	return (['youtube.com', 'www.youtube.com', 'youtu.be'].indexOf(host) >= 0);
};
YoutubeChannelLibrary.open = function (ytUrl) {
	var channelPath = url.parse(ytUrl).path;
	var channelId = path.basename(channelPath);
	return YoutubeChannelLibrary(channelId);
};

module.exports = {
	Channel: YoutubeChannelLibrary,
	supports: YoutubeChannelLibrary.supports,
	open: YoutubeChannelLibrary.open
};