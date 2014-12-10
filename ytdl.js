var ytdl = require('ytdl-core');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');
var lame = require('lame');
var Speaker = require('speaker');

var dl = ytdl('http://www.youtube.com/watch?v=A02s8omM_hI', {
	filter: function(format) { return format.container === 'mp4'; }
});
var converter = ffmpeg(dl).format('mp3').pipe(new lame.Decoder())
	.on('format', function (format) {
		this.pipe(new Speaker(format));
	});
