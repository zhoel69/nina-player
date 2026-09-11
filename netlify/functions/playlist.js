/*
 * Nina Universal Smart Video Player
 * Netlify Function: playlist.js
 *
 * STABLE VERSION
 *
 * FIX:
 * - GET Supabase menggunakan batch
 * - GET menggunakan pagination
 * - Batch GET dapat berjalan paralel secara terbatas
 * - POST menggunakan batch
 * - POST retry otomatis
 * - GET retry otomatis
 * - Tidak langsung JSON.parse jika response kosong
 * - Semua response Netlify selalu JSON
 * - Mencegah request Supabase terlalu besar
 * - Menangani playlist ribuan channel
 * - Duplicate ID dicegah
 * - ID kosong dibuat otomatis
 * - PUT update berdasarkan ID
 * - DELETE berdasarkan ID
 * - DELETE ALL
 * - Response DELETE berisi pesan sukses
 *
 * Tidak membutuhkan @supabase/supabase-js
 * Menggunakan Supabase REST API langsung
 */


/* ==================================================
 * ENVIRONMENT
 * ================================================== */

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE =
  "nina_playlist";


const SUPABASE_ENDPOINT =
  `${SUPABASE_URL}/rest/v1/${TABLE}`;


/* ==================================================
 * CONFIG
 * ================================================== */

/*
 * Jumlah record per request Supabase.
 */
const GET_BATCH_SIZE =
  500;


/*
 * Maksimal request GET yang berjalan
 * secara bersamaan.
 *
 * Tidak dibuat terlalu besar agar
 * Supabase tidak dibanjiri request.
 */
const GET_CONCURRENCY =
  4;


/*
 * Jumlah retry jika Supabase
 * mengalami error sementara.
 */
const MAX_RETRY =
  3;


/*
 * Jeda antar retry.
 */
const RETRY_DELAY =
  700;


/* ==================================================
 * BASIC HEADERS
 * ================================================== */

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


/* ==================================================
 * DELAY
 * ================================================== */

function sleep(ms){

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* ==================================================
 * GENERATE ID
 * ================================================== */

function generateId(){

  if(
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID ===
      "function"
  ){

    return globalThis.crypto.randomUUID();

  }


  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );

}


/* ==================================================
 * SAFE JSON PARSE
 * ================================================== */

function safeJsonParse(text){

  if(
    !text ||
    !String(text).trim()
  ){

    return null;

  }


  try{

    return JSON.parse(
      text
    );

  }catch{

    return null;

  }

}


/* ==================================================
 * MAP DATABASE -> PLAYER
 * ================================================== */

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


/* ==================================================
 * MAP PLAYER -> DATABASE
 * ================================================== */

function mapItem(item){

  return {

    id:
      item.id ||
      generateId(),

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


/* ==================================================
 * SUPABASE FETCH WITH RETRY
 * ================================================== */

async function supabaseFetch(
  url,
  options = {},
  retryCount = 0
){

  try{

    const response =
      await fetch(
        url,
        options
      );


    const text =
      await response.text();


    /*
     * HTTP sukses.
     */
    if(
      response.ok
    ){

      return {

        response,

        text

      };

    }


    /*
     * Error yang kemungkinan
     * sementara.
     */
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;


    if(
      retryable &&
      retryCount < MAX_RETRY
    ){

      console.log(
        `Supabase retry ${retryCount + 1}/${MAX_RETRY}, HTTP ${response.status}`
      );


      await sleep(
        RETRY_DELAY *
        (retryCount + 1)
      );


      return supabaseFetch(
        url,
        options,
        retryCount + 1
      );

    }


    throw new Error(
      `Supabase HTTP ${response.status}: ${text || "response kosong"}`
    );


  }catch(error){

    /*
     * Network error / timeout.
     */
    if(
      retryCount <
      MAX_RETRY
    ){

      console.log(
        `Supabase network retry ${retryCount + 1}/${MAX_RETRY}:`,
        error.message
      );


      await sleep(
        RETRY_DELAY *
        (retryCount + 1)
      );


      return supabaseFetch(
        url,
        options,
        retryCount + 1
      );

    }


    throw error;

  }

}


/* ==================================================
 * GET ONE PAGE
 * ================================================== */

async function getPage(
  offset
){

  const url =
    `${SUPABASE_ENDPOINT}` +
    `?select=*` +
    `&order=added_at.asc` +
    `&limit=${GET_BATCH_SIZE}` +
    `&offset=${offset}`;


  console.log(
    `Nina GET batch offset=${offset}`
  );


  const result =
    await supabaseFetch(
      url,
      {

        method:
          "GET",

        headers:
          supabaseHeaders()

      }
    );


  /*
   * Response kosong dianggap
   * sebagai array kosong,
   * bukan JSON.parse error.
   */
  if(
    !result.text ||
    !result.text.trim()
  ){

    return [];

  }


  const rows =
    safeJsonParse(
      result.text
    );


  if(
    rows === null
  ){

    throw new Error(
      `Supabase GET response bukan JSON valid pada offset ${offset}.`
    );

  }


  if(
    !Array.isArray(rows)
  ){

    throw new Error(
      `Supabase GET response bukan array pada offset ${offset}.`
    );

  }


  return rows;

}


/* ==================================================
 * MAIN FUNCTION
 * ================================================== */

exports.handler =
  async function(event){

  const headers = {

    "Content-Type":
      "application/json; charset=utf-8",

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET,POST,PUT,DELETE,OPTIONS",

    "Cache-Control":
      "no-store"

  };


  try{

    /* ==============================================
     * CEK ENVIRONMENT
     * ============================================== */

    if(
      !SUPABASE_URL ||
      !SUPABASE_KEY
    ){

      return {

        statusCode:
          500,

        headers,

        body:
          JSON.stringify({

            success:
              false,

            error:
              "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia."

          })

      };

    }


    /* ==============================================
     * OPTIONS
     * ============================================== */

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


    /* ==================================================
     * GET PLAYLIST
     * ================================================== */

    if(
      event.httpMethod ===
      "GET"
    ){

      console.log(
        "Nina Playlist GET START"
      );


      let allRows =
        [];


      /*
       * ==============================================
       * AMBIL BATCH PERTAMA
       * ==============================================
       */

      const firstPage =
        await getPage(
          0
        );


      allRows.push(
        ...firstPage
      );


      /*
       * Jika kurang dari batch size,
       * berarti hanya satu halaman.
       */

      if(
        firstPage.length <
        GET_BATCH_SIZE
      ){

        const videos =
          allRows.map(
            mapRow
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
       * ==============================================
       * CARI BATCH BERIKUTNYA
       * ==============================================
       *
       * Kita ambil beberapa batch sekaligus.
       *
       * Tidak satu per satu ribuan request.
       */

      let nextOffset =
        GET_BATCH_SIZE;


      while(true){

        const offsets =
          [];


        /*
         * Buat maksimal 4 request
         * dalam satu gelombang.
         */

        for(
          let i = 0;
          i < GET_CONCURRENCY;
          i++
        ){

          offsets.push(
            nextOffset +
            (
              i *
              GET_BATCH_SIZE
            )
          );

        }


        console.log(
          "Nina Playlist GET wave:",
          offsets
        );


        const pages =
          await Promise.all(
            offsets.map(
              offset =>
                getPage(
                  offset
                )
            )
          );


        let finished =
          false;


        for(
          const page of pages
        ){

          allRows.push(
            ...page
          );


          /*
           * Kalau salah satu batch
           * kurang dari 500,
           * kemungkinan sudah mencapai
           * akhir database.
           */

          if(
            page.length <
            GET_BATCH_SIZE
          ){

            finished =
              true;

          }

        }


        if(
          finished
        ){

          break;

        }


        nextOffset +=
          GET_CONCURRENCY *
          GET_BATCH_SIZE;

      }


      /*
       * ==============================================
       * HILANGKAN DUPLICATE ID
       * ==============================================
       */

      const uniqueMap =
        new Map();


      for(
        const row of allRows
      ){

        if(
          row &&
          row.id
        ){

          uniqueMap.set(
            String(row.id),
            row
          );

        }

      }


      const uniqueRows =
        Array.from(
          uniqueMap.values()
        );


      /*
       * ==============================================
       * MAP KE PLAYER
       * ==============================================
       */

      const videos =
        uniqueRows.map(
          mapRow
        );


      console.log(
        `Nina Playlist GET SELESAI: ${videos.length} channel.`
      );


      /*
       * RESPONSE JSON SELALU VALID
       */

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


    /* ==================================================
     * POST
     * ================================================== */

    if(
      event.httpMethod ===
      "POST"
    ){

      let body;


      try{

        body =
          event.body
            ? JSON.parse(
                event.body
              )
            : null;

      }catch{

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                "Body request bukan JSON yang valid."

            })

        };

      }


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

              success:
                false,

              error:
                "Tidak ada data video."

            })

        };

      }


      /*
       * MAP
       */

      const mappedRows =
        items.map(
          mapItem
        );


      /*
       * DEDUPLICATE ID
       */

      const uniqueMap =
        new Map();


      for(
        const row of mappedRows
      ){

        let id =
          String(
            row.id ||
            ""
          ).trim();


        if(
          !id
        ){

          id =
            generateId();

        }


        row.id =
          id;


        uniqueMap.set(
          id,
          row
        );

      }


      const rows =
        Array.from(
          uniqueMap.values()
        );


      const duplicateRemoved =
        items.length -
        rows.length;


      /*
       * ==============================================
       * BATCH SAVE
       * ==============================================
       */

      const BATCH_SIZE =
        100;


      let savedCount =
        0;


      const errors =
        [];


      for(
        let i = 0;
        i < rows.length;
        i += BATCH_SIZE
      ){

        const batch =
          rows.slice(
            i,
            i + BATCH_SIZE
          );


        const batchNumber =
          Math.floor(
            i /
            BATCH_SIZE
          ) + 1;


        console.log(
          `Nina POST batch ${batchNumber}: ${batch.length} channel`
        );


        try{

          const result =
            await supabaseFetch(
              SUPABASE_ENDPOINT,
              {

                method:
                  "POST",

                headers:
                  supabaseHeaders({

                    "Prefer":
                      "resolution=merge-duplicates,return=minimal"

                  }),

                body:
                  JSON.stringify(
                    batch
                  )

              }
            );


          /*
           * Response kosong TIDAK dianggap
           * sebagai JSON error.
           *
           * POST menggunakan return=minimal,
           * jadi response kosong memang normal.
           */

          savedCount +=
            batch.length;


        }catch(error){

          console.error(
            `Nina POST batch ${batchNumber} gagal:`,
            error
          );


          errors.push({

            batch:
              batchNumber,

            count:
              batch.length,

            error:
              error.message

          });

        }

      }


      /*
       * Jika ada batch gagal.
       */

      if(
        errors.length
      ){

        return {

          statusCode:
            500,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              count:
                savedCount,

              total:
                rows.length,

              duplicateRemoved:
                duplicateRemoved,

              message:
                "Sebagian playlist berhasil disimpan, tetapi ada batch yang gagal.",

              errors:
                errors

            })

        };

      }


      /*
       * Semua berhasil.
       */

      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify({

            success:
              true,

            count:
              savedCount,

            total:
              rows.length,

            duplicateRemoved:
              duplicateRemoved,

            message:
              "Playlist berhasil disimpan."

          })

      };

    }


    /* ==================================================
     * PUT
     * ================================================== */

    if(
      event.httpMethod ===
      "PUT"
    ){

      let body;


      try{

        body =
          event.body
            ? JSON.parse(
                event.body
              )
            : null;

      }catch{

        return {

          statusCode:
            400,

          headers,

          body:
            JSON.stringify({

              success:
                false,

              error:
                "Body request bukan JSON yang valid."

            })

        };

      }


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

              success:
                false,

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


      const result =
        await supabaseFetch(
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


      const data =
        safeJsonParse(
          result.text
        );


      return {

        statusCode:
          200,

        headers,

        body:
          JSON.stringify({

            success:
              true,

            message:
              "Channel berhasil diperbarui.",

            data:
              data || []

          })

      };

    }


    /* ==================================================
     * DELETE
     * ================================================== */

    if(
      event.httpMethod ===
      "DELETE"
    ){

      const params =
        event.queryStringParameters ||
        {};


      const id =
        params.id;


      /* ==============================================
       * DELETE ALL
       * ============================================== */

      if(
        params.all ===
        "true"
      ){

        const result =
          await supabaseFetch(
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


        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                "all",

              message:
                "Semua channel berhasil dihapus."

            })

        };

      }


      /* ==============================================
       * DELETE BY ID
       * ============================================== */

      if(
        id
      ){

        const result =
          await supabaseFetch(
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


        return {

          statusCode:
            200,

          headers,

          body:
            JSON.stringify({

              success:
                true,

              deleted:
                id,

              message:
                "Channel berhasil dihapus."

            })

        };

      }


      return {

        statusCode:
          400,

        headers,

        body:
          JSON.stringify({

            success:
              false,

            error:
              "Gunakan ?id=... atau ?all=true"

          })

      };

    }


    /* ==================================================
     * METHOD TIDAK DIDUKUNG
     * ================================================== */

    return {

      statusCode:
        405,

      headers,

      body:
        JSON.stringify({

          success:
            false,

          error:
            "Method tidak didukung."

        })

    };


  }catch(error){

    console.error(
      "Nina Playlist Error:",
      error
    );


    /*
     * PENTING:
     *
     * Apapun errornya, Netlify Function
     * tetap mengembalikan JSON yang valid.
     *
     * Ini mencegah error frontend:
     *
     * Unexpected end of JSON input
     */

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
