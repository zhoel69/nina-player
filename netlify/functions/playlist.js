const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = "nina_playlist";

function headers() {
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`
  };
}

exports.handler = async function(event) {

  const responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: responseHeaders,
      body: ""
    };
  }

  try {

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error(
        "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia."
      );
    }


    // ==========================================
    // GET - AMBIL SEMUA PLAYLIST
    // ==========================================

    if (event.httpMethod === "GET") {

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=added_at.asc`,
        {
          method: "GET",
          headers: headers()
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          data.error_description ||
          JSON.stringify(data)
        );
      }

      const videos = (data || []).map(row => ({
        id: row.id,
        url: row.url || "",
        title: row.title || "",
        name: row.name || "",

        youtubeId: row.youtube_id || "",
        thumbnail: row.thumbnail || "",
        publishedAt: row.published_at || "",

        sourceType: row.source_type || "",
        sourceGroup: row.source_group || "",
        channelName: row.channel_name || "",
        channelId: row.channel_id || "",
        channelGroup: row.channel_group || "",

        tvgId: row.tvg_id || "",
        tvgName: row.tvg_name || "",
        tvgLogo: row.tvg_logo || "",
        tvgCountry: row.tvg_country || "",
        tvgLanguage: row.tvg_language || "",
        tvgShift: row.tvg_shift || "",

        playlistSource: row.playlist_source || "",

        contentType: row.content_type || "",
        duration: row.duration || "",
        durationSeconds: Number(row.duration_seconds || 0),

        isLive: Boolean(row.is_live),

        mediaType: row.media_type || "",

        addedAt: Number(row.added_at || 0)
      }));

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify(videos)
      };
    }


    // ==========================================
    // POST - TAMBAH VIDEO
    // ==========================================

    if (event.httpMethod === "POST") {

      const body = event.body
        ? JSON.parse(event.body)
        : null;

      const items =
        Array.isArray(body)
          ? body
          : Array.isArray(body?.videos)
            ? body.videos
            : body
              ? [body]
              : [];

      if (!items.length) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({
            error: "Tidak ada data video."
          })
        };
      }

      const rows = items.map(item => ({
        id: item.id || "",
        url: item.url || "",
        title: item.title || "",
        name: item.name || item.title || "",

        youtube_id: item.youtubeId || "",
        thumbnail: item.thumbnail || "",
        published_at: item.publishedAt || "",

        source_type: item.sourceType || "",
        source_group: item.sourceGroup || "",
        channel_name: item.channelName || "",
        channel_id: item.channelId || "",
        channel_group: item.channelGroup || "",

        tvg_id: item.tvgId || "",
        tvg_name: item.tvgName || "",
        tvg_logo: item.tvgLogo || "",
        tvg_country: item.tvgCountry || "",
        tvg_language: item.tvgLanguage || "",
        tvg_shift: item.tvgShift || "",

        playlist_source: item.playlistSource || "",

        content_type: item.contentType || "",
        duration: item.duration || "",
        duration_seconds: Number(item.durationSeconds || 0),

        is_live: Boolean(item.isLive),

        media_type: item.mediaType || "",

        added_at: Number(item.addedAt || Date.now())
      }));

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}`,
        {
          method: "POST",
          headers: {
            ...headers(),
            "Prefer": "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify(rows)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          JSON.stringify(data)
        );
      }

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          success: true,
          count: data.length
        })
      };
    }


    // ==========================================
    // PUT - UPDATE VIDEO
    // ==========================================

    if (event.httpMethod === "PUT") {

      const body = event.body
        ? JSON.parse(event.body)
        : null;

      if (!body || !body.id) {
        return {
          statusCode: 400,
          headers: responseHeaders,
          body: JSON.stringify({
            error: "ID video tidak ditemukan."
          })
        };
      }

      const row = {
        url: body.url || "",
        title: body.title || "",
        name: body.name || body.title || "",

        youtube_id: body.youtubeId || "",
        thumbnail: body.thumbnail || "",
        published_at: body.publishedAt || "",

        source_type: body.sourceType || "",
        source_group: body.sourceGroup || "",
        channel_name: body.channelName || "",
        channel_id: body.channelId || "",
        channel_group: body.channelGroup || "",

        tvg_id: body.tvgId || "",
        tvg_name: body.tvgName || "",
        tvg_logo: body.tvgLogo || "",
        tvg_country: body.tvgCountry || "",
        tvg_language: body.tvgLanguage || "",
        tvg_shift: body.tvgShift || "",

        playlist_source: body.playlistSource || "",

        content_type: body.contentType || "",
        duration: body.duration || "",
        duration_seconds: Number(body.durationSeconds || 0),

        is_live: Boolean(body.isLive),

        media_type: body.mediaType || ""
      };

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(body.id)}`,
        {
          method: "PATCH",
          headers: {
            ...headers(),
            "Prefer": "return=representation"
          },
          body: JSON.stringify(row)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          JSON.stringify(data)
        );
      }

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          success: true,
          data
        })
      };
    }


    // ==========================================
    // DELETE
    // ==========================================

    if (event.httpMethod === "DELETE") {

      const params =
        event.queryStringParameters || {};


      // ------------------------------------------
      // HAPUS SEMUA
      // ------------------------------------------

      if (params.all === "true") {

        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?id=not.is.null`,
          {
            method: "DELETE",
            headers: {
              ...headers(),
              "Prefer": "return=representation"
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            JSON.stringify(data)
          );
        }

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            success: true,
            deleted: data.length
          })
        };
      }


      // ------------------------------------------
      // HAPUS SATU ID
      // ------------------------------------------

      if (params.id) {

        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(params.id)}`,
          {
            method: "DELETE",
            headers: {
              ...headers(),
              "Prefer": "return=representation"
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            JSON.stringify(data)
          );
        }

        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify({
            success: true,
            deleted: data.length
          })
        };
      }

      return {
        statusCode: 400,
        headers: responseHeaders,
        body: JSON.stringify({
          error: "ID tidak ditemukan."
        })
      };
    }


    // ==========================================
    // METHOD TIDAK DIDUKUNG
    // ==========================================

    return {
      statusCode: 405,
      headers: responseHeaders,
      body: JSON.stringify({
        error: "Method tidak didukung."
      })
    };


  } catch (error) {

    console.error(
      "Nina Playlist Error:",
      error
    );

    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || "Server error"
      })
    };
  }
};
