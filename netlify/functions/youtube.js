/*
 * Nina Universal Smart Video Player
 * Netlify Function: youtube.js
 *
 * STABLE LARGE PLAYLIST VERSION
 *
 * FITUR:
 * - Mendukung channel dengan ratusan / ribuan video
 * - Pagination YouTube API 50 item / request
 * - nextPageToken diteruskan dengan benar
 * - Retry otomatis
 * - Timeout request
 * - Tidak ada limit jumlah video
 * - Mendukung:
 *   /channel/UCxxxx
 *   /@handle
 *   /user/username
 *   ?list=PLAYLIST_ID
 *   playlistId langsung
 * - Mengambil duration video
 * - Mengembalikan nextPageToken
 */

const YOUTUBE_API_BASE =
  "https://www.googleapis.com/youtube/v3";

const PAGE_SIZE = 50;

const FETCH_TIMEOUT = 15000;

const MAX_RETRIES = 3;


/*
 * =========================================================
 * MAIN HANDLER
 * =========================================================
 */

exports.handler = async (event) => {

  try {

    const API_KEY =
      process.env.YOUTUBE_API_KEY;

    if (!API_KEY) {

      return response(500, {
        success: false,
        error:
          "YOUTUBE_API_KEY belum dipasang di Netlify."
      });

    }


    const params =
      event.queryStringParameters || {};


    const sourceUrl =
      params.url || "";

    const playlistId =
      params.playlistId || "";

    const pageToken =
      params.pageToken || "";


    if (!sourceUrl && !playlistId) {

      return response(400, {
        success: false,
        error:
          "Masukkan URL YouTube channel atau playlist."
      });

    }


    /*
     * =====================================================
     * IDENTITAS PLAYLIST
     * =====================================================
     */

    let targetPlaylistId =
      playlistId;

    let channelName = "";

    let channelId = "";


    /*
     * =====================================================
     * JIKA BELUM PUNYA PLAYLIST ID
     * CARI DARI URL
     * =====================================================
     */

    if (!targetPlaylistId) {

      let parsed;

      try {

        parsed =
          new URL(sourceUrl);

      } catch {

        return response(400, {
          success: false,
          error:
            "URL YouTube tidak valid."
        });

      }


      const host =
        parsed.hostname.toLowerCase();


      /*
       * Validasi host
       */

      const validHost =
        host === "youtube.com" ||
        host === "www.youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be";


      if (!validHost) {

        return response(400, {
          success: false,
          error:
            "URL harus berasal dari YouTube."
        });

      }


      /*
       * ===================================================
       * PLAYLIST
       * ===================================================
       */

      const listId =
        parsed.searchParams.get("list");


      if (listId) {

        targetPlaylistId =
          listId;


        const playlistInfo =
          await getPlaylistInfo(
            targetPlaylistId,
            API_KEY
          );


        channelName =
          playlistInfo.channelTitle ||
          "YouTube";


        channelId =
          playlistInfo.channelId ||
          "";

      }


      /*
       * ===================================================
       * CHANNEL ID
       * ===================================================
       *
       * /channel/UCxxxx
       */

      if (!targetPlaylistId) {

        const channelMatch =
          parsed.pathname.match(
            /^\/channel\/(UC[^/]+)/i
          );


        if (channelMatch) {

          channelId =
            channelMatch[1];


          const channelInfo =
            await getChannelInfo(
              channelId,
              API_KEY
            );


          targetPlaylistId =
            channelInfo.uploadsPlaylistId;


          channelName =
            channelInfo.channelTitle ||
            "YouTube";

        }

      }


      /*
       * ===================================================
       * HANDLE
       * ===================================================
       *
       * /@nama
       */

      if (!targetPlaylistId) {

        const handleMatch =
          parsed.pathname.match(
            /^\/@([^/]+)/i
          );


        if (handleMatch) {

          const result =
            await getUploadsPlaylistByHandle(
              handleMatch[1],
              API_KEY
            );


          targetPlaylistId =
            result.uploadsPlaylistId;


          channelName =
            result.channelTitle ||
            "YouTube";


          channelId =
            result.channelId ||
            "";

        }

      }


      /*
       * ===================================================
       * OLD USERNAME
       * ===================================================
       *
       * /user/nama
       */

      if (!targetPlaylistId) {

        const userMatch =
          parsed.pathname.match(
            /^\/user\/([^/]+)/i
          );


        if (userMatch) {

          const result =
            await getUploadsPlaylistByUsername(
              userMatch[1],
              API_KEY
            );


          targetPlaylistId =
            result.uploadsPlaylistId;


          channelName =
            result.channelTitle ||
            "YouTube";


          channelId =
            result.channelId ||
            "";

        }

      }

    }


    /*
     * =====================================================
     * JIKA REQUEST HALAMAN BERIKUTNYA
     * =====================================================
     *
     * playlistId sudah dikirim dari HTML.
     *
     * Tetap ambil metadata channel supaya response
     * konsisten.
     */

    if (
      targetPlaylistId &&
      !channelName
    ) {

      const playlistInfo =
        await getPlaylistInfo(
          targetPlaylistId,
          API_KEY
        );


      channelName =
        playlistInfo.channelTitle ||
        "YouTube";


      channelId =
        playlistInfo.channelId ||
        "";

    }


    /*
     * =====================================================
     * VALIDASI PLAYLIST
     * =====================================================
     */

    if (!targetPlaylistId) {

      return response(404, {
        success: false,
        error:
          "Channel atau playlist YouTube tidak berhasil ditemukan."
      });

    }


    /*
     * =====================================================
     * AMBIL SATU HALAMAN PLAYLIST
     * =====================================================
     *
     * MAKSIMAL RESMI YOUTUBE:
     * 50 ITEM
     */

    const playlistData =
      await getPlaylistItems(
        targetPlaylistId,
        pageToken,
        API_KEY
      );


    /*
     * =====================================================
     * CHANNEL INFO DARI ITEM
     * =====================================================
     */

    if (
      !channelName &&
      playlistData.items?.[0]?.snippet?.channelTitle
    ) {

      channelName =
        playlistData.items[0]
          .snippet
          .channelTitle;

    }


    /*
     * =====================================================
     * RAW VIDEO
     * =====================================================
     */

    const rawVideos =
      (playlistData.items || [])
        .map((item) => {

          const videoId =
            item.contentDetails?.videoId;


          if (!videoId) {
            return null;
          }


          const snippet =
            item.snippet || {};


          const thumbnails =
            snippet.thumbnails || {};


          const thumbnail =
            thumbnails.medium?.url ||
            thumbnails.high?.url ||
            thumbnails.default?.url ||
            "";


          return {

            videoId,

            title:
              snippet.title ||
              "Tanpa Judul",

            thumbnail,

            publishedAt:
              snippet.publishedAt ||
              "",

            channelName:
              channelName ||
              snippet.channelTitle ||
              "YouTube",

            channelId:
              channelId ||
              snippet.channelId ||
              ""

          };

        })
        .filter(Boolean);


    /*
     * =====================================================
     * VIDEO DETAIL
     * =====================================================
     *
     * videos.list maksimal 50 ID.
     *
     * playlistItems juga maksimal 50.
     *
     * Jadi SATU request cukup.
     */

    const videoIds =
      rawVideos
        .map(video => video.videoId)
        .filter(Boolean);


    const details =
      await getVideoDetails(
        videoIds,
        API_KEY
      );


    /*
     * =====================================================
     * DETAIL MAP
     * =====================================================
     */

    const detailMap =
      new Map();


    details.forEach((video) => {

      if (video?.id) {

        detailMap.set(
          video.id,
          video
        );

      }

    });


    /*
     * =====================================================
     * BENTUK HASIL
     * =====================================================
     */

    const videos =
      rawVideos.map((video) => {

        const detail =
          detailMap.get(
            video.videoId
          );


        const duration =
          detail?.contentDetails?.duration ||
          "";


        const durationSeconds =
          parseDuration(
            duration
          );


        /*
         * Heuristik Shorts:
         *
         * <= 180 detik
         */

        const contentType =
          durationSeconds > 0 &&
          durationSeconds <= 180
            ? "Shorts"
            : "Video";


        return {

          url:
            `https://www.youtube.com/watch?v=${video.videoId}`,

          title:
            video.title,

          youtubeId:
            video.videoId,

          thumbnail:
            video.thumbnail,

          publishedAt:
            video.publishedAt,

          sourceType:
            "YouTube",

          sourceGroup:
            video.channelName,

          channelName:
            video.channelName,

          channelId:
            video.channelId,

          duration,

          durationSeconds,

          contentType

        };

      });


    /*
     * =====================================================
     * PAGINATION
     * =====================================================
     *
     * PENTING:
     *
     * Tidak ada limit jumlah video di sini.
     *
     * Selama YouTube memberikan nextPageToken,
     * HTML dapat meminta halaman berikutnya.
     */

    const nextPageToken =
      playlistData.nextPageToken ||
      null;


    /*
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return response(200, {

      success: true,

      playlistId:
        targetPlaylistId,

      channelName:
        channelName ||
        "YouTube",

      channelId:
        channelId ||
        "",

      videos,

      nextPageToken,

      totalThisPage:
        videos.length,

      hasNextPage:
        Boolean(nextPageToken)

    });


  } catch (error) {

    console.error(
      "YouTube Function Error:",
      error
    );


    return response(500, {

      success: false,

      error:
        error?.message ||
        "Terjadi kesalahan pada Netlify Function."

    });

  }

};


/*
 * =========================================================
 * GET PLAYLIST ITEMS
 * =========================================================
 */

async function getPlaylistItems(
  playlistId,
  pageToken,
  apiKey
) {

  const url =
    new URL(
      `${YOUTUBE_API_BASE}/playlistItems`
    );


  url.searchParams.set(
    "part",
    "snippet,contentDetails"
  );


  url.searchParams.set(
    "playlistId",
    playlistId
  );


  url.searchParams.set(
    "maxResults",
    String(PAGE_SIZE)
  );


  url.searchParams.set(
    "key",
    apiKey
  );


  if (pageToken) {

    url.searchParams.set(
      "pageToken",
      pageToken
    );

  }


  return youtubeFetch(
    url.toString()
  );

}


/*
 * =========================================================
 * GET CHANNEL INFO
 * =========================================================
 */

async function getChannelInfo(
  channelId,
  apiKey
) {

  const url =
    new URL(
      `${YOUTUBE_API_BASE}/channels`
    );


  url.searchParams.set(
    "part",
    "snippet,contentDetails"
  );


  url.searchParams.set(
    "id",
    channelId
  );


  url.searchParams.set(
    "key",
    apiKey
  );


  const data =
    await youtubeFetch(
      url.toString()
    );


  const channel =
    data.items?.[0];


  if (!channel) {

    return {

      channelTitle: "",

      channelId: "",

      uploadsPlaylistId: ""

    };

  }


  return {

    channelTitle:
      channel.snippet?.title ||
      "",

    channelId:
      channel.id ||
      channelId,

    uploadsPlaylistId:
      channel.contentDetails
        ?.relatedPlaylists
        ?.uploads ||
      ""

  };

}


/*
 * =========================================================
 * GET CHANNEL BY HANDLE
 * =========================================================
 */

async function getUploadsPlaylistByHandle(
  handle,
  apiKey
) {

  const url =
    new URL(
      `${YOUTUBE_API_BASE}/channels`
    );


  url.searchParams.set(
    "part",
    "snippet,contentDetails"
  );


  url.searchParams.set(
    "forHandle",
    `@${handle}`
  );


  url.searchParams.set(
    "key",
    apiKey
  );


  const data =
    await youtubeFetch(
      url.toString()
    );


  const channel =
    data.items?.[0];


  if (!channel) {

    return {

      channelTitle: "",

      channelId: "",

      uploadsPlaylistId: ""

    };

  }


  return {

    channelTitle:
      channel.snippet?.title ||
      "",

    channelId:
      channel.id ||
      "",

    uploadsPlaylistId:
      channel.contentDetails
        ?.relatedPlaylists
        ?.uploads ||
      ""

  };

}


/*
 * =========================================================
 * GET CHANNEL BY USERNAME
 * =========================================================
 */

async function getUploadsPlaylistByUsername(
  username,
  apiKey
) {

  const url =
    new URL(
      `${YOUTUBE_API_BASE}/channels`
    );


  url.searchParams.set(
    "part",
    "snippet,contentDetails"
  );


  url.searchParams.set(
    "forUsername",
    username
  );


  url.searchParams.set(
    "key",
    apiKey
  );


  const data =
    await youtubeFetch(
      url.toString()
    );


  const channel =
    data.items?.[0];


  if (!channel) {

    return {

      channelTitle: "",

      channelId: "",

      uploadsPlaylistId: ""

    };

  }


  return {

    channelTitle:
      channel.snippet?.title ||
      "",

    channelId:
      channel.id ||
      "",

    uploadsPlaylistId:
      channel.contentDetails
        ?.relatedPlaylists
        ?.uploads ||
      ""

  };

}


/*
 * =========================================================
 * GET PLAYLIST INFO
 * =========================================================
 */

async function getPlaylistInfo(
  playlistId,
  apiKey
) {

  const url =
    new URL(
      `${YOUTUBE_API_BASE}/playlists`
    );


  url.searchParams.set(
    "part",
    "snippet"
  );


  url.searchParams.set(
    "id",
    playlistId
  );


  url.searchParams.set(
    "key",
    apiKey
  );


  const data =
    await youtubeFetch(
      url.toString()
    );


  const playlist =
    data.items?.[0];


  return {

    channelTitle:
      playlist?.snippet?.channelTitle ||
      "",

    channelId:
      playlist?.snippet?.channelId ||
      ""

  };

}


/*
 * =========================================================
 * GET VIDEO DETAILS
 * =========================================================
 */

async function getVideoDetails(
  videoIds,
  apiKey
) {

  if (!videoIds.length) {
    return [];
  }


  /*
   * YouTube videos.list menerima
   * maksimal 50 ID sekaligus.
   *
   * Kita tetap pecah menjadi batch 50
   * supaya fungsi aman jika suatu saat
   * dipanggil dengan jumlah ID lebih besar.
   */

  const chunks = [];


  for (
    let i = 0;
    i < videoIds.length;
    i += 50
  ) {

    chunks.push(
      videoIds.slice(
        i,
        i + 50
      )
    );

  }


  const allDetails = [];


  for (const chunk of chunks) {

    const url =
      new URL(
        `${YOUTUBE_API_BASE}/videos`
      );


    url.searchParams.set(
      "part",
      "snippet,contentDetails"
    );


    url.searchParams.set(
      "id",
      chunk.join(",")
    );


    url.searchParams.set(
      "key",
      apiKey
    );


    const data =
      await youtubeFetch(
        url.toString()
      );


    if (
      Array.isArray(data.items)
    ) {

      allDetails.push(
        ...data.items
      );

    }

  }


  return allDetails;

}


/*
 * =========================================================
 * YOUTUBE FETCH
 * =========================================================
 *
 * Retry otomatis:
 *
 * percobaan 1
 * percobaan 2
 * percobaan 3
 *
 * Dengan timeout supaya Function
 * tidak menggantung terlalu lama.
 */

async function youtubeFetch(
  url
) {

  let lastError;


  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {

    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT
      );


    try {

      const result =
        await fetch(
          url,
          {
            method: "GET",
            signal:
              controller.signal
          }
        );


      clearTimeout(timeout);


      const data =
        await result.json();


      if (result.ok) {

        return data;

      }


      /*
       * Error YouTube
       */

      const message =
        data?.error?.message ||
        `YouTube API HTTP ${result.status}`;


      /*
       * Error yang biasanya tidak berguna
       * untuk di-retry.
       */

      if (
        result.status === 400 ||
        result.status === 401 ||
        result.status === 403 ||
        result.status === 404
      ) {

        throw new Error(
          message
        );

      }


      lastError =
        new Error(
          message
        );


    } catch (error) {

      clearTimeout(timeout);

      lastError =
        error;


      console.error(
        `YouTube request attempt ${attempt} failed:`,
        error?.message
      );

    }


    /*
     * Jangan retry terlalu cepat.
     */

    if (
      attempt < MAX_RETRIES
    ) {

      const delay =
        500 * attempt;


      await sleep(
        delay
      );

    }

  }


  throw (
    lastError ||
    new Error(
      "YouTube API request gagal."
    )
  );

}


/*
 * =========================================================
 * PARSE ISO 8601 DURATION
 * =========================================================
 */

function parseDuration(
  duration
) {

  if (!duration) {
    return 0;
  }


  const match =
    duration.match(
      /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    );


  if (!match) {
    return 0;
  }


  const hours =
    Number(
      match[1] || 0
    );


  const minutes =
    Number(
      match[2] || 0
    );


  const seconds =
    Number(
      match[3] || 0
    );


  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );

}


/*
 * =========================================================
 * SLEEP
 * =========================================================
 */

function sleep(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}


/*
 * =========================================================
 * RESPONSE
 * =========================================================
 */

function response(
  statusCode,
  body
) {

  return {

    statusCode,

    headers: {

      "Content-Type":
        "application/json",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Access-Control-Allow-Methods":
        "GET, OPTIONS"

    },

    body:
      JSON.stringify(body)

  };

}
