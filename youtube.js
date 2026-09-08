/*
=========================================================
 NINA YOUTUBE IMPORTER
 Netlify Function
=========================================================

 Environment Variable yang dibutuhkan:

 YOUTUBE_API_KEY

 Function URL:

 /.netlify/functions/youtube

 Bisa menerima:

 ?url=https://www.youtube.com/@Channel/videos

 atau:

 ?url=https://www.youtube.com/playlist?list=XXXXXXXX

=========================================================
*/


const YOUTUBE_API =
  "https://www.googleapis.com/youtube/v3";


/* =====================================================
   RESPONSE HELPER
===================================================== */

function jsonResponse(
  body,
  status = 200
){

  return {

    statusCode:status,

    headers:{
      "Content-Type":
        "application/json; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Methods":
        "GET, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type"
    },

    body:
      JSON.stringify(body)

  };

}


/* =====================================================
   YOUTUBE API REQUEST
===================================================== */

async function youtubeRequest(
  endpoint,
  params
){

  const apiKey =
    process.env.YOUTUBE_API_KEY;


  if(!apiKey){

    throw new Error(
      "YOUTUBE_API_KEY belum diset di Netlify Environment Variables."
    );

  }


  const searchParams =
    new URLSearchParams({

      ...params,

      key:apiKey

    });


  const response =
    await fetch(
      YOUTUBE_API +
      endpoint +
      "?" +
      searchParams.toString()
    );


  let data;


  try{

    data =
      await response.json();

  }
  catch(error){

    throw new Error(
      "YouTube API mengembalikan response yang tidak valid."
    );

  }


  if(!response.ok){

    const reason =
      data?.error?.errors?.[0]?.reason ||
      data?.error?.status ||
      "UNKNOWN_ERROR";


    const message =
      data?.error?.message ||
      "YouTube API gagal."


    throw new Error(
      "YouTube API: " +
      message +
      " [" +
      reason +
      "]"
    );

  }


  return data;

}


/* =====================================================
   EXTRACT PLAYLIST ID
===================================================== */

function getPlaylistId(
  url
){

  try{

    const parsed =
      new URL(url);


    const list =
      parsed.searchParams.get(
        "list"
      );


    if(list){

      return list;

    }

  }
  catch(error){}

  return null;

}


/* =====================================================
   EXTRACT CHANNEL ID
===================================================== */

function getChannelIdFromUrl(
  url
){

  try{

    const parsed =
      new URL(url);


    const path =
      parsed.pathname
        .replace(/\/+$/,"");


    /*
      /channel/UCxxxxxxxx
    */

    const channelMatch =
      path.match(
        /^\/channel\/(UC[a-zA-Z0-9_-]+)/
      );


    if(channelMatch){

      return {

        type:"id",

        value:
          channelMatch[1]

      };

    }


    /*
      /@NamaChannel
    */

    const handleMatch =
      path.match(
        /^\/@([^/]+)/
      );


    if(handleMatch){

      return {

        type:"handle",

        value:
          "@" +
          handleMatch[1]

      };

    }


    /*
      /user/NamaUser
    */

    const userMatch =
      path.match(
        /^\/user\/([^/]+)/
      );


    if(userMatch){

      return {

        type:"username",

        value:
          userMatch[1]

      };

    }


    /*
      /c/NamaChannel

      YouTube sudah tidak menjamin
      custom URL selalu bisa dicari
      menggunakan endpoint lama.

      Kita tetap coba search channel.
    */

    const customMatch =
      path.match(
        /^\/c\/([^/]+)/
      );


    if(customMatch){

      return {

        type:"search",

        value:
          customMatch[1]

      };

    }

  }
  catch(error){}

  return null;

}


/* =====================================================
   RESOLVE CHANNEL
===================================================== */

async function resolveChannel(
  url
){

  const info =
    getChannelIdFromUrl(url);


  if(!info){

    throw new Error(
      "URL YouTube tidak dikenali sebagai channel."
    );

  }


  /*
    CHANNEL ID
  */

  if(info.type === "id"){

    const data =
      await youtubeRequest(
        "/channels",
        {

          part:
            "snippet,contentDetails",

          id:
            info.value

        }
      );


    if(
      !data.items ||
      data.items.length === 0
    ){

      throw new Error(
        "Channel ID tidak ditemukan."
      );

    }


    return data.items[0];

  }


  /*
    HANDLE
  */

  if(info.type === "handle"){

    const data =
      await youtubeRequest(
        "/channels",
        {

          part:
            "snippet,contentDetails",

          forHandle:
            info.value

        }
      );


    if(
      !data.items ||
      data.items.length === 0
    ){

      throw new Error(
        "Channel dengan handle " +
        info.value +
        " tidak ditemukan."
      );

    }


    return data.items[0];

  }


  /*
    USERNAME LAMA
  */

  if(info.type === "username"){

    const data =
      await youtubeRequest(
        "/channels",
        {

          part:
            "snippet,contentDetails",

          forUsername:
            info.value

        }
      );


    if(
      !data.items ||
      data.items.length === 0
    ){

      throw new Error(
        "Username YouTube tidak ditemukan."
      );

    }


    return data.items[0];

  }


  /*
    CUSTOM /c/...
  */

  if(info.type === "search"){

    const data =
      await youtubeRequest(
        "/search",
        {

          part:
            "snippet",

          q:
            info.value,

          type:
            "channel",

          maxResults:
            "5"

        }
      );


    if(
      !data.items ||
      data.items.length === 0
    ){

      throw new Error(
        "Channel custom URL tidak ditemukan."
      );

    }


    /*
      Pilih hasil pertama.

      Untuk /c/ URL lama, YouTube tidak
      selalu memberikan hubungan langsung
      ke channel ID melalui URL.
    */

    const channelId =
      data.items[0]
        ?.snippet
        ?.channelId;


    if(!channelId){

      throw new Error(
        "Channel ID tidak ditemukan dari custom URL."
      );

    }


    const channelData =
      await youtubeRequest(
        "/channels",
        {

          part:
            "snippet,contentDetails",

          id:
            channelId

        }
      );


    if(
      !channelData.items ||
      channelData.items.length === 0
    ){

      throw new Error(
        "Data channel tidak ditemukan."
      );

    }


    return channelData.items[0];

  }


  throw new Error(
    "Jenis URL channel tidak didukung."
  );

}


/* =====================================================
   FETCH PLAYLIST
===================================================== */

async function fetchPlaylist(
  playlistId
){

  const videos = [];

  let pageToken =
    "";


  /*
    Safety guard.

    Menghindari loop tidak sengaja.
  */

  let pageCount = 0;

  const MAX_PAGES = 500;


  do{

    pageCount++;


    if(
      pageCount > MAX_PAGES
    ){

      throw new Error(
        "Playlist terlalu besar atau pagination melebihi batas keamanan."
      );

    }


    const params = {

      part:
        "snippet,contentDetails",

      playlistId:
        playlistId,

      maxResults:
        "50"

    };


    if(pageToken){

      params.pageToken =
        pageToken;

    }


    const data =
      await youtubeRequest(
        "/playlistItems",
        params
      );


    if(
      Array.isArray(
        data.items
      )
    ){

      data.items.forEach(
        item => {

          const videoId =
            item
              ?.contentDetails
              ?.videoId;


          if(!videoId){

            return;

          }


          const title =
            item
              ?.snippet
              ?.title ||
            "YouTube Video";


          const url =
            "https://www.youtube.com/watch?v=" +
            encodeURIComponent(
              videoId
            );


          videos.push({

            videoId:
              videoId,

            title:
              title,

            url:
              url

          });

        }
      );

    }


    pageToken =
      data.nextPageToken ||
      "";

  }
  while(pageToken);


  return videos;

}


/* =====================================================
   GET PLAYLIST INFO
===================================================== */

async function getPlaylistInfo(
  playlistId
){

  const data =
    await youtubeRequest(
      "/playlists",
      {

        part:
          "snippet",

        id:
          playlistId

      }
    );


  if(
    !data.items ||
    data.items.length === 0
  ){

    throw new Error(
      "Playlist YouTube tidak ditemukan atau tidak dapat diakses."
    );

  }


  return data.items[0];

}


/* =====================================================
   MAIN HANDLER
===================================================== */

exports.handler =
async function(event){

  /*
    OPTIONS / CORS
  */

  if(
    event.httpMethod ===
    "OPTIONS"
  ){

    return jsonResponse(
      {
        ok:true
      }
    );

  }


  if(
    event.httpMethod !==
    "GET"
  ){

    return jsonResponse(
      {
        error:
          "Method tidak didukung. Gunakan GET."
      },
      405
    );

  }


  try{

    const url =
      event
        ?.queryStringParameters
        ?.url;


    if(!url){

      return jsonResponse(
        {
          error:
            "Parameter ?url= wajib diisi."
        },
        400
      );

    }


    let parsed;


    try{

      parsed =
        new URL(url);

    }
    catch(error){

      return jsonResponse(
        {
          error:
            "URL tidak valid."
        },
        400
      );

    }


    const hostname =
      parsed.hostname
        .toLowerCase();


    if(
      !(
        hostname ===
          "youtube.com" ||

        hostname.endsWith(
          ".youtube.com"
        ) ||

        hostname ===
          "youtu.be"
      )
    ){

      return jsonResponse(
        {
          error:
            "URL bukan URL YouTube."
        },
        400
      );

    }


    /*
      ==================================================
      PLAYLIST
      ==================================================
    */

    const playlistId =
      getPlaylistId(url);


    if(playlistId){

      const playlistInfo =
        await getPlaylistInfo(
          playlistId
        );


      const videos =
        await fetchPlaylist(
          playlistId
        );


      return jsonResponse({

        ok:true,

        sourceType:
          "playlist",

        sourceTitle:
          playlistInfo
            ?.snippet
            ?.title ||
          "YouTube Playlist",

        playlistId:
          playlistId,

        total:
          videos.length,

        videos:
          videos

      });

    }


    /*
      ==================================================
      CHANNEL
      ==================================================
    */

    const channel =
      await resolveChannel(
        url
      );


    const uploadsPlaylistId =
      channel
        ?.contentDetails
        ?.relatedPlaylists
        ?.uploads;


    if(!uploadsPlaylistId){

      throw new Error(
        "Uploads playlist channel tidak ditemukan."
      );

    }


    const videos =
      await fetchPlaylist(
        uploadsPlaylistId
      );


    return jsonResponse({

      ok:true,

      sourceType:
        "channel",

      sourceTitle:
        channel
          ?.snippet
          ?.title ||
        "YouTube Channel",

      channelId:
        channel.id,

      uploadsPlaylistId:
        uploadsPlaylistId,

      total:
        videos.length,

      videos:
        videos

    });

  }
  catch(error){

    console.error(
      "Nina YouTube Function Error:",
      error
    );


    return jsonResponse(
      {

        ok:false,

        error:
          error?.message ||
          "Terjadi kesalahan pada server."

      },
      500
    );

  }

};
