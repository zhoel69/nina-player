exports.handler = async function(event) {

  const playlist = `#EXTM3U

#EXTINF:-1 tvg-name="RCTI TEST",RCTI TEST
https://1s1.rctiplus.id/rcti2023-avc1_2500000=17-mp4a_128000=2.m3u8

#EXTINF:-1 tvg-name="SCTV TEST",SCTV TEST
https://cdn-livetv5.metube.id/hls/sctv_480/index.m3u8

#EXTINF:-1 tvg-name="Indosiar TEST",Indosiar TEST
http://210.210.155.37/qwr9ew/s/s04/index.m3u8

#EXTINF:-1 tvg-name="Trans TV TEST",Trans TV TEST
https://video.detik.com/transtv/smil:transtv.smil/playlist.m3u8

#EXTINF:-1 tvg-name="Trans7 TEST",Trans7 TEST
https://video.detik.com/trans7/smil:trans7.smil/playlist.m3u8

#EXTINF:-1 tvg-name="TVRI TEST",TVRI TEST
https://ott-balancer.tvri.go.id/live/eds/Nasional/hls/Nasional.m3u8
`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "audio/x-mpegurl; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    },
    body: playlist
  };
};