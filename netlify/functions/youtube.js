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

    /*
     * Kalau yang dikirim adalah URL YouTube,
     * kita cari apakah itu playlist atau channel.
     */
    if (!targetPlaylistId) {
      const parsed = new URL(sourceUrl);
      const host = parsed.hostname.toLowerCase();

      if (
        host !== "youtube.com" &&
        !host.endsWith(".youtube.com") &&
        host !== "www.youtube.com"
      ) {
        return response(400, {
          error: "URL harus berasal dari YouTube."
        });
      }

      /*
       * ==============================
       * PLAYLIST
       * ==============================
       */

      const listId = parsed.searchParams.get("list");

      if (listId) {
        targetPlaylistId = listId;
      }

      /*
       * ==============================
       * CHANNEL ID
       * ==============================
       */

      if (!targetPlaylistId) {
        const channelMatch =
          parsed.pathname.match(/^\/channel\/(UC[^/]+)/i);

        if (channelMatch) {
          targetPlaylistId =
            await getUploadsPlaylist(
              channelMatch[1],
              API_KEY
            );
        }
      }

      /*
       * ==============================
       * CHANNEL HANDLE
       * ==============================
       *
       * Contoh:
       * https://www.youtube.com/@NamaChannel
       */

      if (!targetPlaylistId) {
        const handleMatch =
          parsed.pathname.match(/^\/@([^/]+)/);

        if (handleMatch) {
          targetPlaylistId =
            await getUploadsPlaylistByHandle(
              handleMatch[1],
              API_KEY
            );
        }
      }

      /*
       * ==============================
       * USERNAME LAMA
       * ==============================
       *
       * Contoh:
       * /user/username
       */

      if (!targetPlaylistId) {
        const userMatch =
          parsed.pathname.match(/^\/user\/([^/]+)/i);

        if (userMatch) {
          targetPlaylistId =
            await getUploadsPlaylistByUsername(
              userMatch[1],
              API_KEY
            );
        }
      }
    }

    if (!targetPlaylistId) {
      return response(404, {
        error:
          "Channel atau playlist YouTube tidak berhasil ditemukan."
      });
    }

    /*
     * ==============================
     * AMBIL VIDEO
     * ==============================
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
     * ==============================
     * FORMAT DATA
     * ==============================
     */

    const videos =
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
            url:
              `https://www.youtube.com/watch?v=${videoId}`,

            title:
              snippet.title ||
              "Tanpa Judul",

            youtubeId:
              videoId,

            thumbnail:
              thumbnail,

            publishedAt:
              snippet.publishedAt ||
              ""
          };

        })
        .filter(Boolean);

    return response(200, {
      success: true,

      playlistId:
        targetPlaylistId,

      videos:

        videos,

      nextPageToken:
        data.nextPageToken || null,

      totalThisPage:
        videos.length
    });

  }
  catch (error) {

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
 * =====================================================
 * CARI UPLOADS PLAYLIST BERDASARKAN CHANNEL ID
 * =====================================================
 */

async function getUploadsPlaylist(
  channelId,
  apiKey
) {

  const url =
    new URL(
      "https://www.googleapis.com/youtube/v3/channels"
    );

  url.searchParams.set(
    "part",
    "contentDetails"
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

  return (
    channel
      ?.contentDetails
      ?.relatedPlaylists
      ?.uploads ||
    null
  );

}


/*
 * =====================================================
 * CARI CHANNEL BERDASARKAN HANDLE
 * =====================================================
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
    "contentDetails"
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

  return (
    channel
      ?.contentDetails
      ?.relatedPlaylists
      ?.uploads ||
    null
  );

}


/*
 * =====================================================
 * USERNAME YOUTUBE LAMA
 * =====================================================
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
    "contentDetails"
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

  return (
    channel
      ?.contentDetails
      ?.relatedPlaylists
      ?.uploads ||
    null
  );

}


/*
 * =====================================================
 * RESPONSE
 * =====================================================
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
