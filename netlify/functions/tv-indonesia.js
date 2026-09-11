exports.handler = async function(event) {

  const playlist = `#EXTM3U

#EXTINF:-1 tvg-name="RCTI",RCTI
https://vcdn2.rctiplus.id/live/eds/rcti_fta/live_fta/rcti_fta.m3u8

#EXTINF:-1 tvg-name="SCTV",SCTV
https://cdn-livetv5.metube.id/hls/sctv_480/index.m3u8

#EXTINF:-1 tvg-name="Indosiar",Indosiar
http://210.210.155.37/qwr9ew/s/s04/index.m3u8

#EXTINF:-1 tvg-name="Trans TV",Trans TV
https://video.detik.com/transtv/smil:transtv.smil/playlist.m3u8

#EXTINF:-1 tvg-name="Trans7",Trans7
https://video.detik.com/trans7/smil:trans7.smil/playlist.m3u8

#EXTINF:-1 tvg-name="TVRI Nasional",TVRI Nasional
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
