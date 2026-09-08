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
     * Kalau request pertama menggunakan URL,
     * cari channel / playlist terlebih dahulu.
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

      const listId = parsed.searchParams.get("list");

      /*
       * PLAYLIST
       */
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
     * Kalau request berikutnya menggunakan playlistId,
     * ambil nama channel dari playlist agar tetap tersedia.
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
     * Ambil video dari playlist uploads.
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
     * Kalau nama channel masih kosong,
     * coba ambil dari item pertama.
     */
    if (
      !channelName &&
      data.items?.[0]?.snippet?.channelTitle
    ) {
      channelName =
        data.items[0].snippet.channelTitle;
    }

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
              "",

            sourceType:
              "YouTube",

            sourceGroup:
              channelName ||
              snippet.channelTitle ||
              "YouTube",

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

      videos:
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
 * CHANNEL INFO
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
