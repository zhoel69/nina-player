/*
 * Nina Universal Smart Video Player
 * Netlify Function: playlist.js
 *
 * Tidak membutuhkan @supabase/supabase-js
 * Tidak membutuhkan package.json
 *
 * Menggunakan Supabase REST API langsung
 * dengan fetch() bawaan Node.js.
 */


const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE =
  "nina_playlist";


/*
 * Supabase REST endpoint
 */
const SUPABASE_ENDPOINT =
  `${SUPABASE_URL}/rest/v1/${TABLE}`;


/*
 * Header dasar Supabase
 */
function supabaseHeaders(extra = {}){

  return {
    "apikey":
      SUPABASE_KEY,

    "Authorization":
      `Bearer ${SUPABASE_KEY}`,

    "Content-Type":
      "application/json",

    ...extra
  };

}


/*
 * Ubah row database menjadi format
 * yang dipakai index.html
 */
function mapRow(row){

  return {

    id:
      row.id,

    url:
      row.url || "",

    title:
      row.title || "",

    name:
      row.name || "",

    youtubeId:
      row.youtube_id || "",

    thumbnail:
      row.thumbnail || "",

    publishedAt:
      row.published_at || "",


    sourceType:
      row.source_type || "",

    sourceGroup:
      row.source_group || "",

    channelName:
      row.channel_name || "",

    channelId:
      row.channel_id || "",

    channelGroup:
      row.channel_group || "",


    tvgId:
      row.tvg_id || "",

    tvgName:
      row.tvg_name || "",

    tvgLogo:
      row.tvg_logo || "",

    tvgCountry:
      row.tvg_country || "",

    tvgLanguage:
      row.tvg_language || "",

    tvgShift:
      row.tvg_shift || "",


    playlistSource:
      row.playlist_source || "",


    contentType:
      row.content_type || "",

    duration:
      row.duration || "",

    durationSeconds:
      Number(
        row.duration_seconds || 0
      ),


    isLive:
      Boolean(
        row.is_live
      ),


    mediaType:
      row.media_type || "",


    addedAt:
      Number(
        row.added_at || 0
      )

  };

}


/*
 * Ubah item dari aplikasi menjadi
 * row database Supabase
 */
function mapItem(item){

  return {

    id:
      item.id || "",

    url:
      item.url || "",

    title:
      item.title || "",

    name:
      item.name ||
      item.title ||
      "",


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
      Number(
        item.durationSeconds || 0
      ),


    is_live:
      Boolean(
        item.isLive
      ),


    media_type:
      item.mediaType || "",


    added_at:
      Number(
        item.addedAt ||
        Date.now()
      )

  };

}


/*
 * Main Netlify Function
 */
exports.handler =
  async function(event){

  /*
   * Response headers
   */
  const headers = {

    "Content-Type":
      "application/json",

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET,POST,PUT,DELETE,OPTIONS"

  };


  try{


    /*
     * Cek environment variable
     */
    if(
      !SUPABASE_URL ||
      !SUPABASE_KEY
    ){

      throw new Error(
        "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia di Netlify Environment Variables."
      );

    }


    /*
     * CORS PREFLIGHT
     */
    if(
      event.httpMethod ===
      "OPTIONS"
    ){

      return {

        statusCode:
          204,

        headers,

        body:
          ""

      };

    }


    /*
     ==================================================
     GET
     ==================================================
     *
     * Ambil seluruh playlist.
     *
     * Supabase/PostgREST dapat membatasi jumlah
     * data dalam satu response.
     *
     * Karena itu kita mengambil data per 1000 row.
     *
     * Contoh:
     *
     * 0 - 999
     * 1000 - 1999
     * 2000 - 2999
     * dst.
     *
     * Sampai semua data selesai.
     */
    if(
      event.httpMethod ===
      "GET"
    ){

      const PAGE_SIZE =
        1000;


      let allRows = [];

      let from = 0;


      while(true){


        const to =
          from +
          PAGE_SIZE -
          1;


        const url =
          `${SUPABASE_ENDPOINT}` +
          `?select=*` +
          `&order=added_at.asc`;


        const response =
          await fetch(
            url,
            {

              method:
                "GET",

              headers:
                supabaseHeaders({

                  "Range":
                    `${from}-${to}`,

                  "Prefer":
                    "count=exact"

                })

            }
          );


        const text =
          await response.text();


        if(
          !response.ok
        ){

          throw new Error(
            `Supabase GET HTTP ${response.status}: ${text}`
          );

        }


        let rows;


        try{

          rows =
            text
              ? JSON.parse(text)
              : [];

        }catch(error){

          throw new Error(
            `Supabase GET mengembalikan response bukan JSON: ${text.slice(0,500)}`
          );

        }


        if(
          !Array.isArray(rows)
        ){

          throw new Error(
            "Response Supabase GET bukan array."
          );

        }


        allRows.push(
          ...rows
        );


        console.log(
          `Nina Playlist GET: batch ${from}-${to}, mendapat ${rows.length} record.`
        );


        /*
         * Kalau kurang dari 1000,
         * berarti sudah mencapai data terakhir.
         */
        if(
          rows.length <
          PAGE_SIZE
        ){

          break;

        }


        from +=
          PAGE_SIZE;


      }


      const videos =
        allRows.map(
          mapRow
        );


      console.log(
        `Nina Playlist GET SELESAI: ${videos.length} records berhasil diambil.`
      );


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify(
            videos
          )

      };

    }


    /*
     ==================================================
     POST
     ==================================================
     *
     * Tambah satu atau banyak video.
     *
     * Menggunakan upsert berdasarkan ID.
     */
    if(
      event.httpMethod ===
      "POST"
    ){


      const body =
        event.body
          ? JSON.parse(
              event.body
            )
          : null;


      const items =
        Array.isArray(body)

          ? body

          : Array.isArray(
              body?.videos
            )

            ? body.videos

            : body

              ? [body]

              : [];


      if(
        !items.length
      ){

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              error:
                "Tidak ada data video."

            })

        };

      }


      const rows =
        items.map(
          mapItem
        );


      const response =
        await fetch(
          SUPABASE_ENDPOINT,
          {

            method:
              "POST",

            headers:
              supabaseHeaders({

                "Prefer":
                  "resolution=merge-duplicates,return=representation"

              }),

            body:
              JSON.stringify(
                rows
              )

          }
        );


      const text =
        await response.text();


      if(
        !response.ok
      ){

        throw new Error(
          `Supabase POST HTTP ${response.status}: ${text}`
        );

      }


      let data = [];


      try{

        data =
          text
            ? JSON.parse(text)
            : [];

      }catch{

        data = [];

      }


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify({

            success:
              true,

            count:
              Array.isArray(data)
                ? data.length
                : rows.length

          })

      };

    }


    /*
     ==================================================
     PUT
     ==================================================
     *
     * Update video berdasarkan ID.
     */
    if(
      event.httpMethod ===
      "PUT"
    ){


      const body =
        event.body
          ? JSON.parse(
              event.body
            )
          : null;


      if(
        !body ||
        !body.id
      ){

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              error:
                "ID video tidak ditemukan."

            })

        };

      }


      const row = {

        url:
          body.url || "",

        title:
          body.title || "",

        name:
          body.name ||
          body.title ||
          "",


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
          Number(
            body.durationSeconds || 0
          ),


        is_live:
          Boolean(
            body.isLive
          ),


        media_type:
          body.mediaType || "",


        added_at:
          Number(
            body.addedAt ||
            Date.now()
          )

      };


      const response =
        await fetch(
          `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(body.id)}`,
          {

            method:
              "PATCH",

            headers:
              supabaseHeaders({

                "Prefer":
                  "return=representation"

              }),

            body:
              JSON.stringify(
                row
              )

          }
        );


      const text =
        await response.text();


      if(
        !response.ok
      ){

        throw new Error(
          `Supabase PUT HTTP ${response.status}: ${text}`
        );

      }


      let data = [];


      try{

        data =
          text
            ? JSON.parse(text)
            : [];

      }catch{

        data = [];

      }


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify({

            success:
              true,

            data

          })

      };

    }


    /*
     ==================================================
     DELETE
     ==================================================
     */
    if(
      event.httpMethod ===
      "DELETE"
    ){


      const id =
        event
          .queryStringParameters
          ?.id;


      /*
       * DELETE ALL
       */
      if(
        event
          .queryStringParameters
          ?.all ===
        "true"
      ){


        const response =
          await fetch(
            `${SUPABASE_ENDPOINT}?id=not.is.null`,
            {

              method:
                "DELETE",

              headers:
                supabaseHeaders({

                  "Prefer":
                    "return=minimal"

                })

            }
          );


        const text =
          await response.text();


        if(
          !response.ok
        ){

          throw new Error(
            `Supabase DELETE ALL HTTP ${response.status}: ${text}`
          );

        }


        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                "all"

            })

        };

      }


      /*
       * DELETE BY ID
       */
      if(id){


        const response =
          await fetch(
            `${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(id)}`,
            {

              method:
                "DELETE",

              headers:
                supabaseHeaders({

                  "Prefer":
                    "return=minimal"

                })

            }
          );


        const text =
          await response.text();


        if(
          !response.ok
        ){

          throw new Error(
            `Supabase DELETE HTTP ${response.status}: ${text}`
          );

        }


        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                id

            })

        };

      }


      return {

        statusCode:
          400,

        headers,

        body:
          JSON.stringify({

            error:
              "Gunakan ?id=... atau ?all=true"

          })

      };

    }


    /*
     ==================================================
     METHOD TIDAK DIDUKUNG
     ==================================================
     */
    return {

      statusCode:
        405,

      headers,

      body:
        JSON.stringify({

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

      statusCode:
        500,

      headers,

      body:
        JSON.stringify({

          success:
            false,

          error:
            error.message ||
            "Terjadi kesalahan server."

        })

    };

  }

};
