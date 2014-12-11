var url = require('url');
var Youtube = require('youtube-api');
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var lame = require('lame');

Youtube.authenticate({
	type: 'key',
	key: 'AIzaSyDHw3Gx1hheYHaGt343VIIVlpWH_iAZTtE'
});

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
	var host = url.parse(trackUrl).host;
	return (['youtube.com', 'www.youtube.com', 'youtu.be'].indexOf(host) >= 0);
};
YoutubeChannelLibrary.prototype.open = function (trackUrl) {
	var dl = ytdl(trackUrl, {
		filter: function(format) { return format.container === 'mp4'; }
	});
	return ffmpeg(dl).format('mp3').pipe(new lame.Decoder());
};

module.exports = {
	Channel: YoutubeChannelLibrary
};