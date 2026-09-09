exports.handler = async (event) => {
  try {
    const API_KEY = process.env.YOUTUBE_API_KEY;

    if (!API_KEY) {
      return response(500, {
        error: "YOUTUBE_API_KEY belum dipasang di Netlify."
      });
    }

    const params = event.queryStringParameters || {};

    const sourceUrl = params.url;
    const playlistId = params.playlistId;
    const pageToken = params.pageToken || "";

    if (!sourceUrl && !playlistId) {
      return response(400, {
        error: "Masukkan URL YouTube channel atau playlist."
      });
    }

    let targetPlaylistId = playlistId;
    let channelName = "";
    let channelId = "";

    /*
     * =========================
     * CARI CHANNEL / PLAYLIST
     * =========================
     */

    if (!targetPlaylistId) {
      const parsed = new URL(sourceUrl);
      const host = parsed.hostname.toLowerCase();

      if (
        host !== "youtube.com" &&
        !host.endsWith(".youtube.com") &&
        host !== "www.youtube.com" &&
        host !== "youtu.be"
      ) {
        return response(400, {
          error: "URL harus berasal dari YouTube."
        });
      }

      /*
       * PLAYLIST
       */
      const listId = parsed.searchParams.get("list");

      if (listId) {
        targetPlaylistId = listId;

        const playlistInfo =
          await getPlaylistInfo(
            targetPlaylistId,
            API_KEY
          );

        channelName =
          playlistInfo.channelTitle || "YouTube";

        channelId =
          playlistInfo.channelId || "";
      }

      /*
       * CHANNEL ID
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
       * CHANNEL HANDLE
       * /@nama
       */
      if (!targetPlaylistId) {
        const handleMatch =
          parsed.pathname.match(
            /^\/@([^/]+)/
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
       * OLD USERNAME
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
     * REQUEST PAGINATION BERIKUTNYA
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

    if (!targetPlaylistId) {
      return response(404, {
        error:
          "Channel atau playlist YouTube tidak berhasil ditemukan."
      });
    }

    /*
     * =========================
     * AMBIL VIDEO
     * =========================
     */

    const apiUrl =
      new URL(
        "https://www.googleapis.com/youtube/v3/playlistItems"
      );

    apiUrl.searchParams.set(
      "part",
      "snippet,contentDetails"
    );

    apiUrl.searchParams.set(
      "playlistId",
      targetPlaylistId
    );

    apiUrl.searchParams.set(
      "maxResults",
      "50"
    );

    apiUrl.searchParams.set(
      "key",
      API_KEY
    );

    if (pageToken) {
      apiUrl.searchParams.set(
        "pageToken",
        pageToken
      );
    }

    const result =
      await fetch(
        apiUrl.toString()
      );

    const data =
      await result.json();

    if (!result.ok) {
      return response(
        result.status,
        {
          error:
            data?.error?.message ||
            "YouTube API gagal."
        }
      );
    }

    /*
     * Kalau channel masih kosong,
     * ambil dari item pertama.
     */
    if (
      !channelName &&
      data.items?.[0]?.snippet?.channelTitle
    ) {
      channelName =
        data.items[0].snippet.channelTitle;
    }

    /*
     * =========================
     * KUMPULKAN VIDEO ID
     * =========================
     */

    const rawVideos =
      (data.items || [])
        .map(item => {

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
     * =========================
     * AMBIL DETAIL DURASI
     * =========================
     *
     * videos.list maksimal 50 ID.
     * Satu halaman playlist kita juga
     * maksimal 50, jadi cukup satu request.
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
     * Buat Map:
     *
     * videoId -> detail video
     */

    const detailMap =
      new Map();

    details.forEach(video => {
      detailMap.set(
        video.id,
        video
      );
    });

    /*
     * =========================
     * BENTUK HASIL FINAL
     * =========================
     */

    const videos =
      rawVideos.map(video => {

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
         * KLASIFIKASI
         *
         * <= 180 detik
         * dianggap Shorts.
         *
         * Ini heuristik karena YouTube
         * Data API tidak memberikan
         * field isShort.
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

          /*
           * Channel menjadi group utama.
           */
          sourceGroup:
            video.channelName,

          channelName:
            video.channelName,

          channelId:
            video.channelId,

          /*
           * Data tambahan.
           */
          duration,

          durationSeconds,

          contentType

        };

      });

    /*
     * =========================
     * RESPONSE
     * =========================
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

      nextPageToken:
        data.nextPageToken ||
        null,

      totalThisPage:
        videos.length

    });

  } catch (error) {

    console.error(
      "YouTube Function Error:",
      error
    );

    return response(500, {

      error:
        error?.message ||
        "Terjadi kesalahan pada Netlify Function."

    });

  }
};


/*
 * =========================
 * GET CHANNEL INFO
 * =========================
 */

async function getChannelInfo(
  channelId,
  apiKey
) {

  const url =
    new URL(
      "https://www.googleapis.com/youtube/v3/channels"
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

  const result =
    await fetch(
      url.toString()
    );

  const data =
    await result.json();

  if (!result.ok) {
    throw new Error(
      data?.error?.message ||
      "Gagal mengambil channel YouTube."
    );
  }

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
 * =========================
 * HANDLE
 * =========================
 */

async function getUploadsPlaylistByHandle(
  handle,
  apiKey
) {

  const url =
    new URL(
      "https://www.googleapis.com/youtube/v3/channels"
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

  const result =
    await fetch(
      url.toString()
    );

  const data =
    await result.json();

  if (!result.ok) {
    throw new Error(
      data?.error?.message ||
      "Gagal mencari channel berdasarkan handle."
    );
  }

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
 * =========================
 * OLD USERNAME
 * =========================
 */

async function getUploadsPlaylistByUsername(
  username,
  apiKey
) {

  const url =
    new URL(
      "https://www.googleapis.com/youtube/v3/channels"
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

  const result =
    await fetch(
      url.toString()
    );

  const data =
    await result.json();

  if (!result.ok) {
    throw new Error(
      data?.error?.message ||
      "Gagal mencari username YouTube."
    );
  }

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
 * =========================
 * PLAYLIST INFO
 * =========================
 */

async function getPlaylistInfo(
  playlistId,
  apiKey
) {

  const url =
    new URL(
      "https://www.googleapis.com/youtube/v3/playlists"
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

  const result =
    await fetch(
      url.toString()
    );

  const data =
    await result.json();

  if (!result.ok) {
    throw new Error(
      data?.error?.message ||
      "Gagal mengambil informasi playlist."
    );
  }

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
 * =========================
 * VIDEO DETAILS
 * =========================
 */

async function getVideoDetails(
  videoIds,
  apiKey
) {

  if (!videoIds.length) {
    return [];
  }

  const url =
    new URL(
      "https://www.googleapis.com/youtube/v3/videos"
    );

  url.searchParams.set(
    "part",
    "snippet,contentDetails"
  );

  url.searchParams.set(
    "id",
    videoIds.join(",")
  );

  url.searchParams.set(
    "key",
    apiKey
  );

  const result =
    await fetch(
      url.toString()
    );

  const data =
    await result.json();

  if (!result.ok) {
    throw new Error(
      data?.error?.message ||
      "Gagal mengambil detail video YouTube."
    );
  }

  return data.items || [];

}


/*
 * =========================
 * ISO 8601 DURATION
 * =========================
 *
 * Contoh:
 *
 * PT30S       = 30 detik
 * PT1M20S     = 80 detik
 * PT3M        = 180 detik
 * PT1H2M10S   = 3730 detik
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
    Number(match[1] || 0);

  const minutes =
    Number(match[2] || 0);

  const seconds =
    Number(match[3] || 0);

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );

}


/*
 * =========================
 * RESPONSE
 * =========================
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
        "Content-Type"

    },

    body:
      JSON.stringify(body)

  };

}
