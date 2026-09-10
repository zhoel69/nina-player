const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function(event) {

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  };

  // CORS preflight
  if(event.httpMethod === "OPTIONS"){
    return {
      statusCode: 204,
      headers,
      body: ""
    };
  }

  try{

    /*
     * GET
     * Ambil seluruh playlist secara bertahap.
     *
     * Supabase biasanya membatasi hasil satu request.
     * Kita ambil 1000 per batch sampai semua data selesai.
     */
    if(event.httpMethod === "GET"){

      const PAGE_SIZE = 1000;

      let allRows = [];
      let from = 0;

      while(true){

        const {
          data,
          error
        } = await supabase
          .from("nina_playlist")
          .select("*")
          .order("added_at", {
            ascending: true
          })
          .range(
            from,
            from + PAGE_SIZE - 1
          );

        if(error){
          throw error;
        }

        const rows =
          Array.isArray(data)
            ? data
            : [];

        allRows.push(...rows);

        /*
         * Kalau jumlah data kurang dari PAGE_SIZE,
         * berarti sudah mencapai data terakhir.
         */
        if(rows.length < PAGE_SIZE){
          break;
        }

        from += PAGE_SIZE;

      }

      const videos = allRows.map(row => ({
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
        durationSeconds:
          Number(row.duration_seconds || 0),

        isLive:
          Boolean(row.is_live),

        mediaType:
          row.media_type || "",

        addedAt:
          Number(row.added_at || 0)
      }));

      console.log(
        `Nina Playlist GET: ${videos.length} records berhasil diambil.`
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(videos)
      };
    }


    /*
     * POST
     * Tambah satu atau banyak video
     */
    if(event.httpMethod === "POST"){

      const body =
        event.body
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

      if(!items.length){

        return {
          statusCode: 400,
          headers,
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

        youtube_id:
          item.youtubeId || "",

        thumbnail:
          item.thumbnail || "",

        published_at:
          item.publishedAt || "",

        source_type:
          item.sourceType || "",

        source_group:
          item.sourceGroup || "",

        channel_name:
          item.channelName || "",

        channel_id:
          item.channelId || "",

        channel_group:
          item.channelGroup || "",

        tvg_id:
          item.tvgId || "",

        tvg_name:
          item.tvgName || "",

        tvg_logo:
          item.tvgLogo || "",

        tvg_country:
          item.tvgCountry || "",

        tvg_language:
          item.tvgLanguage || "",

        tvg_shift:
          item.tvgShift || "",

        playlist_source:
          item.playlistSource || "",

        content_type:
          item.contentType || "",

        duration:
          item.duration || "",

        duration_seconds:
          Number(item.durationSeconds || 0),

        is_live:
          Boolean(item.isLive),

        media_type:
          item.mediaType || "",

        added_at:
          Number(item.addedAt || Date.now())
      }));

      const {
        data,
        error
      } = await supabase
        .from("nina_playlist")
        .upsert(rows, {
          onConflict: "id"
        })
        .select();

      if(error){
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          count: data?.length || rows.length
        })
      };
    }


    /*
     * PUT
     * Update video
     */
    if(event.httpMethod === "PUT"){

      const body =
        event.body
          ? JSON.parse(event.body)
          : null;

      if(!body || !body.id){

        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "ID video tidak ditemukan."
          })
        };

      }

      const row = {
        url: body.url || "",
        title: body.title || "",
        name: body.name || body.title || "",

        youtube_id:
          body.youtubeId || "",

        thumbnail:
          body.thumbnail || "",

        published_at:
          body.publishedAt || "",

        source_type:
          body.sourceType || "",

        source_group:
          body.sourceGroup || "",

        channel_name:
          body.channelName || "",

        channel_id:
          body.channelId || "",

        channel_group:
          body.channelGroup || "",

        tvg_id:
          body.tvgId || "",

        tvg_name:
          body.tvgName || "",

        tvg_logo:
          body.tvgLogo || "",

        tvg_country:
          body.tvgCountry || "",

        tvg_language:
          body.tvgLanguage || "",

        tvg_shift:
          body.tvgShift || "",

        playlist_source:
          body.playlistSource || "",

        content_type:
          body.contentType || "",

        duration:
          body.duration || "",

        duration_seconds:
          Number(body.durationSeconds || 0),

        is_live:
          Boolean(body.isLive),

        media_type:
          body.mediaType || "",

        added_at:
          Number(body.addedAt || Date.now())
      };

      const {
        data,
        error
      } = await supabase
        .from("nina_playlist")
        .update(row)
        .eq("id", body.id)
        .select();

      if(error){
        throw error;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data
        })
      };
    }


    /*
     * DELETE
     * Hapus berdasarkan ID
     */
    if(event.httpMethod === "DELETE"){

      const id =
        event.queryStringParameters?.id;

      /*
       * DELETE ALL
       */
      if(
        event.queryStringParameters?.all === "true"
      ){

        const {
          error
        } = await supabase
          .from("nina_playlist")
          .delete()
          .not("id", "is", null);

        if(error){
          throw error;
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            deleted: "all"
          })
        };
      }


      /*
       * DELETE BY ID
       */
      if(id){

        const {
          error
        } = await supabase
          .from("nina_playlist")
          .delete()
          .eq("id", id);

        if(error){
          throw error;
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            deleted: id
          })
        };
      }


      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error:
            "Gunakan ?id=... atau ?all=true"
        })
      };
    }


    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error:
          "Method tidak didukung."
      })
    };


  }catch(error){

    console.error(
      "Nina Playlist Error:",
      error
    );

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error:
          error.message ||
          "Terjadi kesalahan server."
      })
    };

  }

};
