exports.handler = async function(event) {

  const playlist = `#EXTM3U

#EXTINF:-1 tvg-id="ANTV.id" group-title="Indonesia",ANTV
https://op-group1-swiftservehd-1.dens.tv/s/s07/index.m3u8

#EXTINF:-1 tvg-id="BTV.id" group-title="Indonesia",BTV
https://op-group1-swiftservehd-1.dens.tv/h/h210/index.m3u8

#EXTINF:-1 tvg-id="CNBCIndonesia.id" group-title="Indonesia",CNBC Indonesia
https://live.cnbcindonesia.com/livecnbc/smil:cnbctv.smil/playlist.m3u8

#EXTINF:-1 tvg-id="CNNIndonesia.id" group-title="Indonesia",CNN Indonesia
https://live.cnnindonesia.com/livecnn/smil:cnntv.smil/playlist.m3u8

#EXTINF:-1 tvg-id="DAAITV.id" group-title="Indonesia",DAAI TV
https://op-group1-swiftservesd-1.dens.tv/s/s182/index.m3u8

#EXTINF:-1 tvg-id="GarudaTV.id" group-title="Indonesia",Garuda TV
https://etv-cdn.kdb.co.id/GarudaTV-Stream/index.m3u8

#EXTINF:-1 tvg-id="IDTV.id" group-title="Indonesia",IDTV
https://op-group1-swiftservehd-1.dens.tv/h/h209/index.m3u8

#EXTINF:-1 tvg-id="IndonesianaTV.id" group-title="Indonesia",Indonesiana.TV
https://op-group1-swiftservehd-1.dens.tv/h/h292/index.m3u8

#EXTINF:-1 tvg-id="KompasTV.id" group-title="Indonesia",Kompas TV
https://op-group1-swiftservehd-1.dens.tv/h/h234/index.m3u8

#EXTINF:-1 tvg-id="MagnaChannel.id" group-title="Indonesia",Magna Channel
https://op-group1-swiftservehd-1.dens.tv/h/h24/index.m3u8

#EXTINF:-1 tvg-id="MetroTV.id" group-title="Indonesia",Metro TV
https://edge.medcom.id/live-edge/smil:metro.smil/playlist.m3u8

#EXTINF:-1 tvg-id="NET.id" group-title="Indonesia",NET.
https://op-group1-swiftservehd-1.dens.tv/h/h223/index.m3u8

#EXTINF:-1 tvg-id="NusantaraTV.id" group-title="Indonesia",Nusantara TV
https://nusantaratv.siar.us/nusantaratv/live/playlist.m3u8

#EXTINF:-1 tvg-id="RajawaliTV.id" group-title="Indonesia",Rajawali TV
https://op-group1-swiftservehd-1.dens.tv/h/h10/index.m3u8

#EXTINF:-1 tvg-id="RodjaTV.id" group-title="Indonesia",Rodja TV
https://rodjatv.com/rodjatv/live.m3u8

#EXTINF:-1 tvg-id="RRINet.id" group-title="Indonesia",RRI Net
https://public-streaming.rri.co.id/memfs/b3169f10-7846-496c-a186-698ea5ddd310.m3u8

#EXTINF:-1 tvg-id="Trans7.id" group-title="Indonesia",Trans7
https://video.detik.com/trans7/smil:trans7.smil/playlist.m3u8

#EXTINF:-1 tvg-id="TransTV.id" group-title="Indonesia",Trans TV
https://video.detik.com/transtv/smil:transtv.smil/playlist.m3u8

#EXTINF:-1 tvg-id="tvOne.id" group-title="Indonesia",tvOne
https://op-group1-swiftservehd-1.dens.tv/h/h224/index.m3u8

#EXTINF:-1 tvg-id="TVRINasional.id" group-title="Indonesia",TVRI Nasional
https://ott-balancer.tvri.go.id/live/eds/Nasional/hls/Nasional.m3u8

#EXTINF:-1 tvg-id="TVRISport.id" group-title="Indonesia",TVRI Sport
https://ott-balancer.tvri.go.id/live/eds/SportHD/hls/SportHD.m3u8

#EXTINF:-1 tvg-id="TVRIWorld.id" group-title="Indonesia",TVRI World
https://ott-balancer.tvri.go.id/live/eds/TVRIWorld/hls/TVRIWorld.m3u8

#EXTINF:-1 tvg-id="VTV.id" group-title="Indonesia",VTV
https://flv.intechmedia.net/live/ch107.m3u8
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